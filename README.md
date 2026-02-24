# Online Enrollment and Academic Records

A lightweight Node.js micro framework designed for seamless deployment on **Vercel**.

This project provides a minimal infrastructure layer for handling:

- File-based API routing
- Static asset serving
- JSON request parsing
- CORS handling
- Standardized HTTP responses
- Environment-based configuration

Built with zero external frameworks and optimized for controlled environments.

## 🚀 Deployment (Vercel)

This project is structured to work seamlessly with Vercel:

- `/public` → Served automatically as static assets
- `/api` → Automatically treated as serverless functions

### Vercel Behavior

| Folder   | Purpose |
|----------|----------|
| `public/` | Static hosting (HTML, CSS, JS, images) |
| `api/`    | Serverless API endpoints |

Accessible via: [https://o-en-aca-r.vercel.app](https://o-en-aca-r.vercel.app/)

No custom server setup required in production.

## 🛠 Local Development

1. nstall dependencies: `npm install`
2. Start local server: `npm run dev`
3. Server will run on:
   1. Frontend `http://localhost:3000`
   2. Backend `http://localhost:8000`

## ⚙️ Environment Configuration

Environment variables are managed through a centralized configuration module. You need to have `.env` file on the root folder.

### Important

- `.env` is for local development only.
- In production (Vercel), configure environment variables via:
  - Vercel Dashboard → Project → Settings → Environment Variables

## 🧠 Design Philosophy

- Zero heavy dependencies
- File-based routing
- Minimal abstraction
- Internal-service focused
- Clear separation of concerns
- Environment-driven configuration

It is intentionally lightweight and avoids Express or other frameworks.

## 🔐 Security Notes

- Includes path normalization guards
- Basic CORS handling
- Centralized error responses

For public-facing production systems, consider:

- Rate limiting
- Input validation
- Payload size limits
- External static asset hosting (CDN)

## 📱 Mobile Compatibility

The frontend is mobile-friendly by default:

- Responsive layout
- Viewport meta configuration
- Adaptive typography

Designed to work cleanly across:

- Android
- iOS
- Tablet
- Desktop

## 📌 Intended Use

- Academic portals
- Enrollment systems
- Internal administrative tools
- Lightweight API backends
- Serverless-first deployments

## 🏢 Scope

Internal infrastructure layer for the Online Enrollment and Academic Records system.

Not intended as a general-purpose public web framework.