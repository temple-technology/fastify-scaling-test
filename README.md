# Fastify Example

This example starts a [Fastify](https://www.fastify.io/) server with PostgreSQL database support using Drizzle ORM.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template/ZZ50Bj)

## ✨ Features

- Fastify
- TypeScript
- PostgreSQL with Drizzle ORM
- CORS support for frontend integration
- Railway deployment ready

## 🛠️ Development Environment Setup

This project uses npm for dependency management and CommonJS for modules.

### For VSCode Users
- Standard TypeScript and module resolution will work out of the box.
- No special configuration required.

### For Other Editors
- Any editor with TypeScript support will work without additional configuration.
- Run `npm install` after cloning.

### Database Setup
1. Copy `env.example` to `.env` and configure your database connection
2. Run database migrations: `npm run db:generate` and `npm run db:push`
3. For development, you can use `npm run db:studio` to view your database

### Running the Project
- `npm install`
- `npm run dev` (for development)
- `npm run build` and `npm start` (for production)

## 💁‍♀️ How to use

- Install dependencies `npm install`
- Set up environment variables (copy `env.example` to `.env`)
- Run database migrations `npm run db:push`
- Connect to your Railway project `railway link`
- Start the development server `railway run npm run dev`

## 🗄️ Database Commands

- `npm run db:generate` - Generate migration files
- `npm run db:push` - Push schema changes to database
- `npm run db:migrate` - Run migrations
- `npm run db:studio` - Open Drizzle Studio (database GUI)

## 🚀 Railway Deployment

This project is configured for Railway deployment with:
- PostgreSQL cluster support (PgPool + 3 PostgreSQL nodes)
- Environment variable configuration
- Production-ready database connection pooling
- CORS configuration for frontend integration
