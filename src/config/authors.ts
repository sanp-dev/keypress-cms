// src/config/authors.ts

export interface AuthorProfile {
  name: string;
  slug: string;
  avatarUrl: string;
  bio: string;
  role: string;
}

// Map each user's email (from USERS_JSON) to their public author profile.
// Add an entry here for every user you add to USERS_JSON.
export const AUTHOR_REGISTRY: Record<string, AuthorProfile> = {
  // Demo admin user — replace with your actual email(s)
  'admin@example.com': {
    name: 'Admin',
    slug: 'admin',
    avatarUrl: '/authors/default.png',
    bio: 'Site administrator.',
    role: 'Editor-in-Chief',
  },

  // Example: add more users below
  // 'writer@example.com': {
  //   name: 'Your Name',
  //   slug: 'your-slug',
  //   avatarUrl: '/authors/your-avatar.webp',
  //   bio: 'Your bio here.',
  //   role: 'Staff Writer',
  // },
};

// Fallback profile shown when no matching author is found
export const DEFAULT_AUTHOR: AuthorProfile = {
  name: 'Editorial Team',
  slug: 'editorial-team',
  avatarUrl: '/authors/default.png',
  bio: 'Published by the editorial team.',
  role: 'Contributor',
};

export function getAuthorProfile(email: string | undefined | null): AuthorProfile {
  if (!email) return DEFAULT_AUTHOR;
  return AUTHOR_REGISTRY[email.toLowerCase().trim()] ?? DEFAULT_AUTHOR;
}