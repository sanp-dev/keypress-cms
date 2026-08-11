// src/config/authors.ts

export interface AuthorProfile {
  name: string;
  slug: string;
  avatarUrl: string;
  bio: string;
  // Role permissions:
  // - 'Editor-in-Chief' (Mapped to 'admin' user role): Has full administrative access (write, edit, delete posts, upload media, notify)
  // - 'Staff Writer' / 'Contributor' (Mapped to 'assistant' user role): Can write and edit posts, but cannot delete posts or manage settings
  role: string;
}

// Map each user's email (from USERS_JSON) to their public author profile.
// Add an entry here for every user you add to USERS_JSON.
export const AUTHOR_REGISTRY: Record<string, AuthorProfile> = {
  // Demo admin user — replace with your actual email(s)
  'admin@example.com': {
    name: 'Admin Name',
    slug: 'admin',
    avatarUrl: '/authors/default.webp',
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
  avatarUrl: '/authors/default.webp',
  bio: 'Published by the editorial team.',
  role: 'Contributor',
};

export function getAuthorProfile(email: string | undefined | null): AuthorProfile {
  if (!email) return DEFAULT_AUTHOR;
  return AUTHOR_REGISTRY[email.toLowerCase().trim()] ?? DEFAULT_AUTHOR;
}