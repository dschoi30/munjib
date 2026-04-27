# Obsidian Clone Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production foundation for the Obsidian-inspired enterprise wiki: Next.js app, PostgreSQL/Prisma schema, development Auth.js login, workspace roles, document CRUD, version snapshots, audit logs, and a basic 3-column UI.

**Architecture:** Use a single Next.js App Router application with product rules in `lib/*` modules and UI in `components/*`. PostgreSQL runs locally through Docker Compose, Prisma owns the schema and seed data, and server actions call document services that enforce workspace permissions before writing data.

**Tech Stack:** Next.js, TypeScript, React, Tailwind CSS, shadcn-compatible UI primitives, Prisma, PostgreSQL, Auth.js Credentials provider, Vitest, Testing Library, Docker Compose.

---

## File Structure

Create the project as a single Next.js app rooted at `/Users/developer/dev/obsidian-clone`.

- `package.json`: scripts and dependencies.
- `tsconfig.json`: TypeScript configuration.
- `next.config.ts`: Next.js config.
- `postcss.config.mjs`: Tailwind PostCSS config.
- `tailwind.config.ts`: Tailwind content and theme config.
- `vitest.config.ts`: unit test config.
- `.env.example`: required local environment variables.
- `.gitignore`: ignore dependencies, build output, env files, Prisma local artifacts, and `.superpowers/`.
- `docker-compose.yml`: local PostgreSQL service.
- `prisma/schema.prisma`: Prisma data model.
- `prisma/seed.ts`: deterministic local seed users, organization, workspace, and sample documents.
- `app/layout.tsx`: root HTML shell.
- `app/globals.css`: base Tailwind styles.
- `app/page.tsx`: redirect into the primary workspace.
- `app/login/page.tsx`: development login page.
- `app/login/login-form.tsx`: client-side Credentials sign-in form.
- `app/workspaces/[workspaceSlug]/page.tsx`: workspace document view.
- `app/workspaces/[workspaceSlug]/actions.ts`: server actions for create, update, and archive.
- `app/api/auth/[...nextauth]/route.ts`: Auth.js route handler.
- `components/app-shell.tsx`: 3-column layout.
- `components/document-list.tsx`: left document list.
- `components/document-editor.tsx`: center document form.
- `components/metadata-panel.tsx`: right version/audit metadata.
- `components/ui/button.tsx`: reusable button.
- `components/ui/input.tsx`: reusable input.
- `components/ui/textarea.tsx`: reusable textarea.
- `lib/auth/config.ts`: Auth.js options.
- `lib/auth/session.ts`: session helpers.
- `lib/db/client.ts`: Prisma client singleton.
- `lib/permissions/workspace.ts`: workspace role checks.
- `lib/documents/service.ts`: document use cases.
- `lib/documents/types.ts`: service input/output types.
- `lib/text/slug.ts`: slug helper.
- `lib/text/plain-text.ts`: Markdown-to-plain-text helper for early `contentText`.
- `lib/audit/log.ts`: audit log helper.
- `tests/permissions/workspace.test.ts`: permission tests.
- `tests/documents/service.test.ts`: document service tests.
- `tests/setup/prisma.ts`: test database cleanup helpers.

## Task 1: Scaffold The Next.js Project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `app/layout.tsx`
- Create: `app/globals.css`
- Create: `app/page.tsx`

- [ ] **Step 1: Create package metadata and scripts**

Create `package.json`:

```json
{
  "name": "obsidian-clone",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@auth/prisma-adapter": "^2.7.4",
    "@prisma/client": "^6.5.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.468.0",
    "next": "^15.0.0",
    "next-auth": "^4.24.11",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwind-merge": "^2.5.5"
  },
  "devDependencies": {
    "@testing-library/react": "^16.1.0",
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.1",
    "@types/react-dom": "^19.0.2",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.17.0",
    "eslint-config-next": "^15.0.0",
    "postcss": "^8.4.49",
    "prisma": "^6.5.0",
    "tailwindcss": "^3.4.17",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

- [ ] **Step 2: Create TypeScript and Next config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **Step 3: Create Tailwind and Vitest config**

Create `postcss.config.mjs`:

```js
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
```

Create `tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(214 18% 86%)",
        surface: "hsl(0 0% 100%)",
        muted: "hsl(210 20% 96%)",
        ink: "hsl(222 22% 12%)",
      },
    },
  },
  plugins: [],
};

export default config;
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Create environment and ignore files**

Create `.env.example`:

```env
DATABASE_URL="postgresql://obsidian:obsidian@localhost:5432/obsidian_clone?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="replace-with-a-local-secret"
```

Create `.gitignore`:

```gitignore
node_modules
.next
dist
coverage
.env
.env.local
.env.*.local
*.log
.DS_Store
.superpowers/
```

- [ ] **Step 5: Create the first app files**

Create `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Obsidian Clone",
  description: "Markdown-first enterprise wiki foundation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create `app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light;
  background: #f6f7f9;
  color: #1c2230;
}

body {
  min-height: 100vh;
}
```

Create `app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/workspaces/company-handbook");
}
```

- [ ] **Step 6: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and dependencies install without errors.

- [ ] **Step 7: Commit scaffold**

Run:

```bash
git add package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs tailwind.config.ts vitest.config.ts .env.example .gitignore app
git commit -m "chore: scaffold next app foundation"
```

Expected: commit succeeds if the directory has been initialized as a Git repository. If not, run `git init` first or skip commits until repository initialization is approved.

## Task 2: Add PostgreSQL And Prisma Schema

**Files:**
- Create: `docker-compose.yml`
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Create: `lib/db/client.ts`

- [ ] **Step 1: Create Docker Compose PostgreSQL**

Create `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: obsidian-clone-postgres
    environment:
      POSTGRES_USER: obsidian
      POSTGRES_PASSWORD: obsidian
      POSTGRES_DB: obsidian_clone
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U obsidian -d obsidian_clone"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  postgres_data:
```

- [ ] **Step 2: Create Prisma schema**

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum OrganizationRole {
  OWNER
  ADMIN
  MEMBER
}

enum WorkspaceRole {
  OWNER
  ADMIN
  EDITOR
  VIEWER
}

enum DocumentStatus {
  ACTIVE
  ARCHIVED
}

enum PermissionResourceType {
  WORKSPACE
  DOCUMENT
}

enum PermissionSubjectType {
  USER
  ORGANIZATION_MEMBER
  WORKSPACE_MEMBER
}

enum PermissionLevel {
  READ
  WRITE
  MANAGE
}

model User {
  id                  String               @id @default(cuid())
  email               String               @unique
  name                String
  avatarUrl           String?
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
  organizationMembers OrganizationMember[]
  workspaceMembers    WorkspaceMember[]
  documentsCreated    Document[]           @relation("DocumentCreatedBy")
  documentsUpdated    Document[]           @relation("DocumentUpdatedBy")
  documentVersions    DocumentVersion[]
  auditLogs           AuditLog[]
}

model Organization {
  id          String               @id @default(cuid())
  name        String
  slug        String               @unique
  createdAt   DateTime             @default(now())
  updatedAt   DateTime             @updatedAt
  members     OrganizationMember[]
  workspaces  Workspace[]
  auditLogs   AuditLog[]
}

model OrganizationMember {
  id             String           @id @default(cuid())
  organizationId String
  userId         String
  role           OrganizationRole @default(MEMBER)
  createdAt      DateTime         @default(now())
  organization   Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user           User             @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([organizationId, userId])
}

model Workspace {
  id             String            @id @default(cuid())
  organizationId String
  name           String
  slug           String
  visibility     String            @default("private")
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt
  organization   Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  members        WorkspaceMember[]
  documents      Document[]

  @@unique([organizationId, slug])
}

model WorkspaceMember {
  id          String        @id @default(cuid())
  workspaceId String
  userId      String
  role        WorkspaceRole @default(VIEWER)
  createdAt   DateTime      @default(now())
  workspace   Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, userId])
}

model Document {
  id              String            @id @default(cuid())
  workspaceId     String
  parentId        String?
  title           String
  slug            String
  path            String
  contentMarkdown String            @default("")
  contentText     String            @default("")
  status          DocumentStatus    @default(ACTIVE)
  createdById     String
  updatedById     String
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  archivedAt      DateTime?
  workspace       Workspace         @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  parent          Document?         @relation("DocumentTree", fields: [parentId], references: [id])
  children        Document[]        @relation("DocumentTree")
  createdBy       User              @relation("DocumentCreatedBy", fields: [createdById], references: [id])
  updatedBy       User              @relation("DocumentUpdatedBy", fields: [updatedById], references: [id])
  versions        DocumentVersion[]

  @@unique([workspaceId, slug])
  @@index([workspaceId, status])
}

model DocumentVersion {
  id              String   @id @default(cuid())
  documentId      String
  versionNumber   Int
  title           String
  contentMarkdown String
  createdById     String
  changeSummary   String?
  createdAt       DateTime @default(now())
  document        Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  createdBy       User     @relation(fields: [createdById], references: [id])

  @@unique([documentId, versionNumber])
}

model Permission {
  id           String                 @id @default(cuid())
  resourceType PermissionResourceType
  resourceId   String
  subjectType  PermissionSubjectType
  subjectId    String
  permission   PermissionLevel
  inheritedFromId String?
  createdAt    DateTime              @default(now())

  @@index([resourceType, resourceId])
  @@index([subjectType, subjectId])
}

model AuditLog {
  id             String       @id @default(cuid())
  organizationId String
  actorId        String
  action         String
  resourceType   String
  resourceId     String
  metadataJson   Json
  createdAt      DateTime     @default(now())
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  actor          User         @relation(fields: [actorId], references: [id])

  @@index([organizationId, createdAt])
  @@index([resourceType, resourceId])
}
```

- [ ] **Step 3: Create Prisma client singleton**

Create `lib/db/client.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 4: Create deterministic seed data**

Create `prisma/seed.ts`:

```ts
import { PrismaClient, WorkspaceRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const owner = await prisma.user.upsert({
    where: { email: "owner@example.com" },
    update: {},
    create: { email: "owner@example.com", name: "Owner User" },
  });

  const editor = await prisma.user.upsert({
    where: { email: "editor@example.com" },
    update: {},
    create: { email: "editor@example.com", name: "Editor User" },
  });

  const viewer = await prisma.user.upsert({
    where: { email: "viewer@example.com" },
    update: {},
    create: { email: "viewer@example.com", name: "Viewer User" },
  });

  const organization = await prisma.organization.upsert({
    where: { slug: "acme" },
    update: {},
    create: { name: "Acme", slug: "acme" },
  });

  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: owner.id } },
    update: { role: "OWNER" },
    create: { organizationId: organization.id, userId: owner.id, role: "OWNER" },
  });

  const workspace = await prisma.workspace.upsert({
    where: { organizationId_slug: { organizationId: organization.id, slug: "company-handbook" } },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Company Handbook",
      slug: "company-handbook",
    },
  });

  for (const [user, role] of [
    [owner, WorkspaceRole.OWNER],
    [editor, WorkspaceRole.EDITOR],
    [viewer, WorkspaceRole.VIEWER],
  ] as const) {
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
      update: { role },
      create: { workspaceId: workspace.id, userId: user.id, role },
    });
  }

  await prisma.document.upsert({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: "welcome" } },
    update: {},
    create: {
      workspaceId: workspace.id,
      title: "Welcome",
      slug: "welcome",
      path: "/welcome",
      contentMarkdown: "# Welcome\n\nThis is the first company handbook document.",
      contentText: "Welcome This is the first company handbook document.",
      createdById: owner.id,
      updatedById: owner.id,
    },
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 5: Start database and run migration**

Run:

```bash
cp .env.example .env
docker compose up -d
npm run db:migrate -- --name init
npm run db:seed
```

Expected: PostgreSQL container is healthy, Prisma migration succeeds, and seed inserts three users plus the `company-handbook` workspace.

- [ ] **Step 6: Commit database foundation**

Run:

```bash
git add docker-compose.yml prisma lib/db .env.example package.json package-lock.json
git commit -m "feat: add postgres prisma foundation"
```

Expected: commit succeeds when Git is initialized.

## Task 3: Implement Permission Utilities

**Files:**
- Create: `lib/permissions/workspace.ts`
- Create: `tests/permissions/workspace.test.ts`

- [ ] **Step 1: Write failing permission tests**

Create `tests/permissions/workspace.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  canManageWorkspace,
  canReadWorkspace,
  canWriteWorkspace,
} from "@/lib/permissions/workspace";

describe("workspace permissions", () => {
  it.each(["OWNER", "ADMIN", "EDITOR", "VIEWER"] as const)(
    "allows %s to read",
    (role) => {
      expect(canReadWorkspace(role)).toBe(true);
    },
  );

  it.each(["OWNER", "ADMIN", "EDITOR"] as const)(
    "allows %s to write",
    (role) => {
      expect(canWriteWorkspace(role)).toBe(true);
    },
  );

  it("does not allow viewer to write", () => {
    expect(canWriteWorkspace("VIEWER")).toBe(false);
  });

  it.each(["OWNER", "ADMIN"] as const)("allows %s to manage", (role) => {
    expect(canManageWorkspace(role)).toBe(true);
  });

  it.each(["EDITOR", "VIEWER"] as const)("does not allow %s to manage", (role) => {
    expect(canManageWorkspace(role)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/permissions/workspace.test.ts
```

Expected: FAIL because `@/lib/permissions/workspace` does not exist.

- [ ] **Step 3: Implement permission utilities**

Create `lib/permissions/workspace.ts`:

```ts
import type { WorkspaceRole } from "@prisma/client";

const readableRoles = new Set<WorkspaceRole>(["OWNER", "ADMIN", "EDITOR", "VIEWER"]);
const writableRoles = new Set<WorkspaceRole>(["OWNER", "ADMIN", "EDITOR"]);
const manageableRoles = new Set<WorkspaceRole>(["OWNER", "ADMIN"]);

export function canReadWorkspace(role: WorkspaceRole | null | undefined) {
  return role ? readableRoles.has(role) : false;
}

export function canWriteWorkspace(role: WorkspaceRole | null | undefined) {
  return role ? writableRoles.has(role) : false;
}

export function canManageWorkspace(role: WorkspaceRole | null | undefined) {
  return role ? manageableRoles.has(role) : false;
}

export function assertCanReadWorkspace(role: WorkspaceRole | null | undefined) {
  if (!canReadWorkspace(role)) {
    throw new Error("WORKSPACE_READ_FORBIDDEN");
  }
}

export function assertCanWriteWorkspace(role: WorkspaceRole | null | undefined) {
  if (!canWriteWorkspace(role)) {
    throw new Error("WORKSPACE_WRITE_FORBIDDEN");
  }
}
```

- [ ] **Step 4: Run permission tests**

Run:

```bash
npm test -- tests/permissions/workspace.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit permission utilities**

Run:

```bash
git add lib/permissions tests/permissions
git commit -m "feat: add workspace permission checks"
```

Expected: commit succeeds when Git is initialized.

## Task 4: Implement Auth.js Development Login

**Files:**
- Create: `lib/auth/config.ts`
- Create: `lib/auth/session.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`
- Create: `app/login/page.tsx`
- Create: `app/login/login-form.tsx`

- [ ] **Step 1: Create Auth.js config**

Create `lib/auth/config.ts`:

```ts
import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";
import { prisma } from "@/lib/db/client";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Development Login",
      credentials: {
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim();
        if (!email) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatarUrl,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
};
```

- [ ] **Step 2: Add NextAuth type augmentation**

Create `next-auth.d.ts`:

```ts
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
```

- [ ] **Step 3: Create session helper**

Create `lib/auth/session.ts`:

```ts
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/config";

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
```

- [ ] **Step 4: Create Auth route**

Create `app/api/auth/[...nextauth]/route.ts`:

```ts
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth/config";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
```

- [ ] **Step 5: Create development login form**

Create `app/login/login-form.tsx`:

```tsx
"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("owner@example.com");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    await signIn("credentials", {
      email,
      callbackUrl: "/workspaces/company-handbook",
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm rounded-lg border border-border bg-white p-6 shadow-sm"
    >
      <h1 className="text-xl font-semibold text-ink">Development login</h1>
      <p className="mt-2 text-sm text-slate-600">
        Use owner@example.com, editor@example.com, or viewer@example.com.
      </p>
      <label className="mt-6 block text-sm font-medium text-slate-700" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="mt-2 w-full rounded-md border border-border px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 w-full rounded-md bg-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Create development login page**

Create `app/login/page.tsx`:

```tsx
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { LoginForm } from "@/app/login/login-form";
import { authOptions } from "@/lib/auth/config";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) {
    redirect("/workspaces/company-handbook");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-6">
      <LoginForm />
    </main>
  );
}
```

- [ ] **Step 7: Run typecheck/build**

Run:

```bash
npm run build
```

Expected: PASS. The root page redirects by URL string, so the workspace route does not need to exist yet for this build step.

- [ ] **Step 8: Commit auth foundation**

Run:

```bash
git add app/api app/login lib/auth next-auth.d.ts
git commit -m "feat: add development auth login"
```

Expected: commit succeeds when Git is initialized.

## Task 5: Implement Document Services With Version And Audit Logs

**Files:**
- Create: `lib/text/slug.ts`
- Create: `lib/text/plain-text.ts`
- Create: `lib/audit/log.ts`
- Create: `lib/documents/types.ts`
- Create: `lib/documents/service.ts`
- Create: `tests/setup/prisma.ts`
- Create: `tests/documents/service.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `tests/documents/service.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { WorkspaceRole } from "@prisma/client";
import {
  archiveDocument,
  createDocument,
  updateDocument,
} from "@/lib/documents/service";
import { prisma } from "@/lib/db/client";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

describe("document service", () => {
  beforeEach(async () => {
    await resetTestData();
  });

  it("creates a document with version and audit log", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);

    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Engineering Guide",
      contentMarkdown: "# Engineering Guide\n\nHello team",
    });

    expect(document.slug).toBe("engineering-guide");

    const versions = await prisma.documentVersion.findMany({
      where: { documentId: document.id },
    });
    expect(versions).toHaveLength(1);
    expect(versions[0]?.versionNumber).toBe(1);

    const auditLogs = await prisma.auditLog.findMany({
      where: { resourceId: document.id, action: "document.created" },
    });
    expect(auditLogs).toHaveLength(1);
  });

  it("updates a document with a new version and audit log", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Runbook",
      contentMarkdown: "# Runbook",
    });

    const updated = await updateDocument({
      documentId: document.id,
      actorId: fixture.user.id,
      title: "Incident Runbook",
      contentMarkdown: "# Incident Runbook\n\nUpdated",
    });

    expect(updated.title).toBe("Incident Runbook");

    const versions = await prisma.documentVersion.findMany({
      where: { documentId: document.id },
      orderBy: { versionNumber: "asc" },
    });
    expect(versions.map((version) => version.versionNumber)).toEqual([1, 2]);

    const auditLogs = await prisma.auditLog.findMany({
      where: { resourceId: document.id, action: "document.updated" },
    });
    expect(auditLogs).toHaveLength(1);
  });

  it("prevents viewer users from writing", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.VIEWER);

    await expect(
      createDocument({
        workspaceSlug: fixture.workspace.slug,
        actorId: fixture.user.id,
        title: "Viewer Doc",
        contentMarkdown: "Denied",
      }),
    ).rejects.toThrow("WORKSPACE_WRITE_FORBIDDEN");
  });

  it("archives a document without hard deleting it", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Old Policy",
      contentMarkdown: "Archive this",
    });

    const archived = await archiveDocument({
      documentId: document.id,
      actorId: fixture.user.id,
    });

    expect(archived.status).toBe("ARCHIVED");
    expect(archived.archivedAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Create test fixture helpers**

Create `tests/setup/prisma.ts`:

```ts
import { WorkspaceRole } from "@prisma/client";
import { prisma } from "@/lib/db/client";

export async function resetTestData() {
  await prisma.auditLog.deleteMany();
  await prisma.documentVersion.deleteMany();
  await prisma.document.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
}

export async function seedWorkspaceFixture(role: WorkspaceRole) {
  const user = await prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${Date.now()}@example.com`,
      name: `${role} User`,
    },
  });

  const organization = await prisma.organization.create({
    data: {
      name: "Test Org",
      slug: `test-org-${Date.now()}`,
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      organizationId: organization.id,
      name: "Test Workspace",
      slug: `test-workspace-${Date.now()}`,
    },
  });

  await prisma.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      role,
    },
  });

  return { user, organization, workspace };
}
```

- [ ] **Step 3: Run service test to verify it fails**

Run:

```bash
npm test -- tests/documents/service.test.ts
```

Expected: FAIL because document service modules do not exist.

- [ ] **Step 4: Implement text helpers and audit log helper**

Create `lib/text/slug.ts`:

```ts
export function slugifyTitle(title: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || "untitled";
}
```

Create `lib/text/plain-text.ts`:

```ts
export function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_\-[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
```

Create `lib/audit/log.ts`:

```ts
import type { Prisma, PrismaClient } from "@prisma/client";

type AuditClient = PrismaClient | Prisma.TransactionClient;

export async function writeAuditLog(
  db: AuditClient,
  input: {
    organizationId: string;
    actorId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    metadata: Prisma.InputJsonValue;
  },
) {
  return db.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadataJson: input.metadata,
    },
  });
}
```

- [ ] **Step 5: Implement document service types**

Create `lib/documents/types.ts`:

```ts
export type CreateDocumentInput = {
  workspaceSlug: string;
  actorId: string;
  title: string;
  contentMarkdown: string;
};

export type UpdateDocumentInput = {
  documentId: string;
  actorId: string;
  title: string;
  contentMarkdown: string;
};

export type ArchiveDocumentInput = {
  documentId: string;
  actorId: string;
};
```

- [ ] **Step 6: Implement document services**

Create `lib/documents/service.ts`:

```ts
import { DocumentStatus, type Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/log";
import { prisma } from "@/lib/db/client";
import { assertCanReadWorkspace, assertCanWriteWorkspace } from "@/lib/permissions/workspace";
import { markdownToPlainText } from "@/lib/text/plain-text";
import { slugifyTitle } from "@/lib/text/slug";
import type {
  ArchiveDocumentInput,
  CreateDocumentInput,
  UpdateDocumentInput,
} from "@/lib/documents/types";

async function getWorkspaceMembership(workspaceSlug: string, actorId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: workspaceSlug },
    include: {
      organization: true,
      members: {
        where: { userId: actorId },
        take: 1,
      },
    },
  });

  if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
  const role = workspace.members[0]?.role;
  assertCanReadWorkspace(role);

  return { workspace, role };
}

async function getDocumentMembership(documentId: string, actorId: string) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      workspace: {
        include: {
          organization: true,
          members: {
            where: { userId: actorId },
            take: 1,
          },
        },
      },
    },
  });

  if (!document) throw new Error("DOCUMENT_NOT_FOUND");
  const role = document.workspace.members[0]?.role;
  assertCanReadWorkspace(role);

  return { document, workspace: document.workspace, role };
}

async function nextVersionNumber(tx: Prisma.TransactionClient, documentId: string) {
  const latest = await tx.documentVersion.findFirst({
    where: { documentId },
    orderBy: { versionNumber: "desc" },
  });

  return latest ? latest.versionNumber + 1 : 1;
}

export async function createDocument(input: CreateDocumentInput) {
  const { workspace, role } = await getWorkspaceMembership(input.workspaceSlug, input.actorId);
  assertCanWriteWorkspace(role);

  const slug = slugifyTitle(input.title);
  const contentText = markdownToPlainText(input.contentMarkdown);

  return prisma.$transaction(async (tx) => {
    const document = await tx.document.create({
      data: {
        workspaceId: workspace.id,
        title: input.title,
        slug,
        path: `/${slug}`,
        contentMarkdown: input.contentMarkdown,
        contentText,
        createdById: input.actorId,
        updatedById: input.actorId,
      },
    });

    await tx.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber: 1,
        title: document.title,
        contentMarkdown: document.contentMarkdown,
        createdById: input.actorId,
        changeSummary: "Initial version",
      },
    });

    await writeAuditLog(tx, {
      organizationId: workspace.organizationId,
      actorId: input.actorId,
      action: "document.created",
      resourceType: "document",
      resourceId: document.id,
      metadata: { title: document.title, slug: document.slug },
    });

    return document;
  });
}

export async function updateDocument(input: UpdateDocumentInput) {
  const { document, workspace, role } = await getDocumentMembership(input.documentId, input.actorId);
  assertCanWriteWorkspace(role);

  const slug = slugifyTitle(input.title);
  const contentText = markdownToPlainText(input.contentMarkdown);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.document.update({
      where: { id: document.id },
      data: {
        title: input.title,
        slug,
        path: `/${slug}`,
        contentMarkdown: input.contentMarkdown,
        contentText,
        updatedById: input.actorId,
      },
    });

    await tx.documentVersion.create({
      data: {
        documentId: updated.id,
        versionNumber: await nextVersionNumber(tx, updated.id),
        title: updated.title,
        contentMarkdown: updated.contentMarkdown,
        createdById: input.actorId,
        changeSummary: "Updated document",
      },
    });

    await writeAuditLog(tx, {
      organizationId: workspace.organizationId,
      actorId: input.actorId,
      action: "document.updated",
      resourceType: "document",
      resourceId: updated.id,
      metadata: { title: updated.title, previousTitle: document.title },
    });

    return updated;
  });
}

export async function archiveDocument(input: ArchiveDocumentInput) {
  const { document, workspace, role } = await getDocumentMembership(input.documentId, input.actorId);
  assertCanWriteWorkspace(role);

  return prisma.$transaction(async (tx) => {
    const archived = await tx.document.update({
      where: { id: document.id },
      data: {
        status: DocumentStatus.ARCHIVED,
        archivedAt: new Date(),
        updatedById: input.actorId,
      },
    });

    await writeAuditLog(tx, {
      organizationId: workspace.organizationId,
      actorId: input.actorId,
      action: "document.archived",
      resourceType: "document",
      resourceId: archived.id,
      metadata: { title: archived.title },
    });

    return archived;
  });
}
```

- [ ] **Step 7: Run service tests**

Run:

```bash
npm test -- tests/documents/service.test.ts
```

Expected: PASS when `DATABASE_URL` points at the local PostgreSQL database.

- [ ] **Step 8: Commit document services**

Run:

```bash
git add lib/text lib/audit lib/documents tests/setup tests/documents
git commit -m "feat: add document service with versions and audit logs"
```

Expected: commit succeeds when Git is initialized.

## Task 6: Build Workspace UI And Server Actions

**Files:**
- Create: `components/ui/button.tsx`
- Create: `components/ui/input.tsx`
- Create: `components/ui/textarea.tsx`
- Create: `components/app-shell.tsx`
- Create: `components/document-list.tsx`
- Create: `components/document-editor.tsx`
- Create: `components/metadata-panel.tsx`
- Create: `app/workspaces/[workspaceSlug]/actions.ts`
- Create: `app/workspaces/[workspaceSlug]/page.tsx`

- [ ] **Step 1: Create UI primitives**

Create `components/ui/button.tsx`:

```tsx
import { ButtonHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={twMerge(
        "inline-flex h-9 items-center justify-center rounded-md bg-ink px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
```

Create `components/ui/input.tsx`:

```tsx
import { InputHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={twMerge(
        "h-9 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-ink",
        className,
      )}
      {...props}
    />
  );
}
```

Create `components/ui/textarea.tsx`:

```tsx
import { TextareaHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={twMerge(
        "min-h-[360px] w-full resize-none rounded-md border border-border bg-white p-3 font-mono text-sm outline-none focus:border-ink",
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Create shell components**

Create `components/app-shell.tsx`:

```tsx
export function AppShell({
  left,
  center,
  right,
}: {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen grid-cols-[280px_minmax(0,1fr)_320px] bg-muted text-ink">
      <aside className="border-r border-border bg-white p-4">{left}</aside>
      <section className="min-w-0 p-5">{center}</section>
      <aside className="border-l border-border bg-white p-4">{right}</aside>
    </main>
  );
}
```

Create `components/document-list.tsx`:

```tsx
import type { Document } from "@prisma/client";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function DocumentList({
  workspaceSlug,
  documents,
  canWrite,
}: {
  workspaceSlug: string;
  documents: Document[];
  canWrite: boolean;
}) {
  return (
    <div>
      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Workspace</p>
        <h1 className="text-lg font-semibold">Company Handbook</h1>
      </div>
      <form action={`/workspaces/${workspaceSlug}/actions/create`} method="post">
        <Button type="submit" disabled={!canWrite} className="mb-4 w-full">
          New document
        </Button>
      </form>
      <nav className="space-y-1">
        {documents.map((document) => (
          <Link
            key={document.id}
            href={`/workspaces/${workspaceSlug}?document=${document.id}`}
            className="block rounded-md px-2 py-2 text-sm hover:bg-muted"
          >
            {document.title}
          </Link>
        ))}
      </nav>
    </div>
  );
}
```

- [ ] **Step 3: Create editor and metadata components**

Create `components/document-editor.tsx`:

```tsx
import type { Document } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function DocumentEditor({
  document,
  canWrite,
  action,
}: {
  document: Document | null;
  canWrite: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  if (!document) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-white">
        <p className="text-sm text-slate-500">Create or select a document.</p>
      </div>
    );
  }

  return (
    <form action={action} className="mx-auto max-w-4xl space-y-4">
      <input type="hidden" name="documentId" value={document.id} />
      <Input name="title" defaultValue={document.title} disabled={!canWrite} />
      <Textarea name="contentMarkdown" defaultValue={document.contentMarkdown} disabled={!canWrite} />
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Preview, backlinks, and graph panels are reserved for the next milestone.
        </p>
        <Button type="submit" disabled={!canWrite}>
          Save
        </Button>
      </div>
    </form>
  );
}
```

Create `components/metadata-panel.tsx`:

```tsx
import type { AuditLog, DocumentVersion } from "@prisma/client";

export function MetadataPanel({
  versions,
  auditLogs,
}: {
  versions: DocumentVersion[];
  auditLogs: AuditLog[];
}) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold">Properties</h2>
        <p className="mt-2 text-sm text-slate-500">Owner, status, and review fields will appear here.</p>
      </section>
      <section>
        <h2 className="text-sm font-semibold">Versions</h2>
        <ul className="mt-2 space-y-2 text-sm text-slate-600">
          {versions.map((version) => (
            <li key={version.id}>v{version.versionNumber}: {version.changeSummary}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-sm font-semibold">Audit log</h2>
        <ul className="mt-2 space-y-2 text-sm text-slate-600">
          {auditLogs.map((log) => (
            <li key={log.id}>{log.action}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Create workspace server actions**

Create `app/workspaces/[workspaceSlug]/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { archiveDocument, createDocument, updateDocument } from "@/lib/documents/service";

export async function updateDocumentAction(formData: FormData) {
  const user = await requireCurrentUser();
  const documentId = String(formData.get("documentId"));
  await updateDocument({
    documentId,
    actorId: user.id,
    title: String(formData.get("title") ?? ""),
    contentMarkdown: String(formData.get("contentMarkdown") ?? ""),
  });
}

export async function createDocumentAction(workspaceSlug: string) {
  const user = await requireCurrentUser();
  const document = await createDocument({
    workspaceSlug,
    actorId: user.id,
    title: "Untitled",
    contentMarkdown: "",
  });
  redirect(`/workspaces/${workspaceSlug}?document=${document.id}`);
}

export async function archiveDocumentAction(formData: FormData) {
  const user = await requireCurrentUser();
  await archiveDocument({
    actorId: user.id,
    documentId: String(formData.get("documentId")),
  });
}
```

- [ ] **Step 5: Create workspace page**

Create `app/workspaces/[workspaceSlug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DocumentEditor } from "@/components/document-editor";
import { DocumentList } from "@/components/document-list";
import { MetadataPanel } from "@/components/metadata-panel";
import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { canWriteWorkspace } from "@/lib/permissions/workspace";
import { createDocumentAction, updateDocumentAction } from "./actions";

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ document?: string }>;
}) {
  const user = await requireCurrentUser();
  const { workspaceSlug } = await params;
  const { document: selectedDocumentId } = await searchParams;

  const workspace = await prisma.workspace.findFirst({
    where: { slug: workspaceSlug },
    include: {
      members: { where: { userId: user.id }, take: 1 },
      documents: {
        where: { status: "ACTIVE" },
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  if (!workspace || !workspace.members[0]) notFound();

  const selectedDocument =
    workspace.documents.find((document) => document.id === selectedDocumentId) ??
    workspace.documents[0] ??
    null;

  const versions = selectedDocument
    ? await prisma.documentVersion.findMany({
        where: { documentId: selectedDocument.id },
        orderBy: { versionNumber: "desc" },
      })
    : [];

  const auditLogs = selectedDocument
    ? await prisma.auditLog.findMany({
        where: { resourceType: "document", resourceId: selectedDocument.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      })
    : [];

  const role = workspace.members[0].role;
  const canWrite = canWriteWorkspace(role);
  const createAction = createDocumentAction.bind(null, workspaceSlug);

  return (
    <AppShell
      left={<DocumentList workspaceSlug={workspaceSlug} documents={workspace.documents} canWrite={canWrite} />}
      center={<DocumentEditor document={selectedDocument} canWrite={canWrite} action={updateDocumentAction} />}
      right={<MetadataPanel versions={versions} auditLogs={auditLogs} />}
    />
  );
}
```

- [ ] **Step 6: Fix create form action route**

Update `components/document-list.tsx` to accept a server action instead of posting to a route:

```tsx
import type { Document } from "@prisma/client";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function DocumentList({
  workspaceSlug,
  documents,
  canWrite,
  createAction,
}: {
  workspaceSlug: string;
  documents: Document[];
  canWrite: boolean;
  createAction: () => Promise<void>;
}) {
  return (
    <div>
      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Workspace</p>
        <h1 className="text-lg font-semibold">Company Handbook</h1>
      </div>
      <form action={createAction}>
        <Button type="submit" disabled={!canWrite} className="mb-4 w-full">
          New document
        </Button>
      </form>
      <nav className="space-y-1">
        {documents.map((document) => (
          <Link
            key={document.id}
            href={`/workspaces/${workspaceSlug}?document=${document.id}`}
            className="block rounded-md px-2 py-2 text-sm hover:bg-muted"
          >
            {document.title}
          </Link>
        ))}
      </nav>
    </div>
  );
}
```

Update the `left` prop in `app/workspaces/[workspaceSlug]/page.tsx`:

```tsx
left={
  <DocumentList
    workspaceSlug={workspaceSlug}
    documents={workspace.documents}
    canWrite={canWrite}
    createAction={createAction}
  />
}
```

- [ ] **Step 7: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit workspace UI**

Run:

```bash
git add app/workspaces components
git commit -m "feat: add workspace document shell"
```

Expected: commit succeeds when Git is initialized.

## Task 7: Final Verification

**Files:**
- Modify only if verification reveals failures in files from earlier tasks.

- [ ] **Step 1: Run database setup from clean state**

Run:

```bash
docker compose up -d
npm run db:generate
npm run db:migrate -- --name verify_foundation
npm run db:seed
```

Expected: commands complete successfully. If Prisma reports that the migration already exists, run `npm run db:migrate` without a new name.

- [ ] **Step 2: Run unit tests**

Run:

```bash
npm test
```

Expected: all permission and document service tests pass.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: Next.js build completes successfully.

- [ ] **Step 4: Start local dev server**

Run:

```bash
npm run dev
```

Expected: app starts on `http://localhost:3000`.

- [ ] **Step 5: Manual smoke test**

Open `http://localhost:3000/login`.

Verify:

- Login with `owner@example.com` reaches `/workspaces/company-handbook`.
- Existing `Welcome` document is visible.
- Owner can create a new document.
- Owner can edit and save a document.
- Version list updates after save.
- Audit log shows document actions.
- Login with `viewer@example.com` shows documents but disables create/save.

- [ ] **Step 6: Commit verification fixes**

If any code changed during verification, run:

```bash
git add .
git commit -m "fix: complete foundation verification"
```

Expected: no commit is needed if verification produced no fixes.

## Self-Review Notes

- Spec coverage: setup, schema, Auth.js development login, workspace roles, document CRUD, version snapshots, audit logs, reserved 3-column UI regions, and verification are covered.
- Out-of-scope features remain excluded: CodeMirror, wiki links, backlinks, tags/frontmatter, search, graph, comments, uploads, SSO/SAML, realtime collaboration, canvas, and publishing.
- Git caveat: the current directory was not a Git repository during planning. Commit steps are included because the skill requires frequent commits, but implementation must initialize Git or intentionally skip commit steps until the user approves repository initialization.
