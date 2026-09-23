# Database

The actual Prisma schema and generated migrations live in `backend/prisma/` (schema.prisma, and `migrations/` once you run `npx prisma migrate dev`), since Prisma expects them next to the code that uses them.

This top-level folder exists per the project's structure convention and is a good place for supplementary material: ER diagrams, seed data scripts, or manual SQL notes, as the project grows.
