   FROM node:20-alpine AS base

    ENV PNPM_HOME="/pnpm"
    ENV PATH="$PNPM_HOME:$PATH"
    
    RUN corepack enable && corepack prepare pnpm@8 --activate
    
    # --------------------------------------------------
    # Dependencies layer (better cache usage)
    # --------------------------------------------------
    FROM base AS deps
    WORKDIR /app
    
    COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
    COPY apps/web/package.json ./apps/web/package.json
    
    RUN pnpm install --frozen-lockfile --filter web...
    
    # --------------------------------------------------
    # Build stage
    # --------------------------------------------------
    FROM base AS builder
    WORKDIR /app
    
    ARG NEXT_PUBLIC_API_URL
    ARG NEXT_PUBLIC_APP_URL
    ARG NEXT_PUBLIC_WS_URL
    
    ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
    ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
    ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
    
    COPY --from=deps /app/node_modules ./node_modules
    COPY . .
    
    RUN pnpm --filter web build
    
    # --------------------------------------------------
    # Production runner
    # --------------------------------------------------
    FROM node:20-alpine AS runner
    WORKDIR /app
    
    ENV NODE_ENV=production
    ENV HOSTNAME=0.0.0.0
    ENV PORT=3000
    
    # Create non-root user
    RUN addgroup -S nodejs -g 1001 && \
        adduser -S nextjs -u 1001 -G nodejs
    
    # Copy standalone output only (minimal runtime files)
    COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
    COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
    COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
    
    USER nextjs
    
    EXPOSE 3000
    
    CMD ["node", "apps/web/server.js"]