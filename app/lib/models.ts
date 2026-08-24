import type { AvatarStyle } from "./avatar";
import type { BannerStyle } from "./banner";

export type UserRole = "reader" | "owner";
export type PostKind = "thought" | "article" | "link";
export type PostBodyFormat = "markdown" | "html";

export type QuoteAttachment =
  | {
      source: "local";
      id: string;
      kind: PostKind;
      title: string | null;
      body: string;
      excerpt: string;
      coverKey: string | null;
      publishedAt: number;
      unavailable?: false;
    }
  | {
      source: "local";
      id: string;
      unavailable: true;
      kind?: PostKind;
      title?: string | null;
      body?: string;
      excerpt?: string;
      coverKey?: string | null;
      publishedAt?: number;
    }
  | {
      source: "x";
      url: string;
      authorName: string | null;
      authorUrl: string | null;
      text: string | null;
    };

export interface Viewer {
  id: string;
  handle: string;
  displayName: string;
  role: UserRole;
  avatarKey: string | null;
  avatarSeed: string | null;
  avatarStyle: AvatarStyle;
}

export interface Profile {
  displayName: string;
  handle: string;
  bio: string;
  location: string | null;
  avatarKey: string | null;
  avatarSeed: string | null;
  avatarStyle: AvatarStyle;
  bannerKey: string | null;
  bannerSeed: string | null;
  bannerStyle: BannerStyle | null;
  jokeFollowers: string;
  followingCount: number;
  subscriberRevealThreshold: number;
  aboutIntro: string;
  aboutHeading: string;
  aboutBody: string;
}

export interface SiteSettings {
  siteName: string;
  siteDescription: string;
  locale: string;
  timezone: string;
  configured: boolean;
}

export interface Topic {
  id: string;
  slug: string;
  name: string;
  description: string;
  color: string;
  postCount?: number;
}

export interface FeedPost {
  id: string;
  slug: string;
  kind: PostKind;
  bodyFormat: PostBodyFormat;
  title: string | null;
  body: string;
  excerpt: string;
  coverKey: string | null;
  pinned: boolean;
  publishedAt: number;
  topics: Topic[];
  reactionCount: number;
  replyCount: number;
  bookmarkCount: number;
  viewerReaction: string | null;
  viewerBookmarked: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalUrl?: string | null;
  quote?: QuoteAttachment | null;
  linkCard?: {
    url: string; linkKind: "internal" | "external" | "youtube"; title: string | null;
    description: string | null; imageUrl: string | null; siteName: string | null;
  } | null;
}

export const REACTIONS = ["❤️", "😂", "🔥", "👏", "🤯", "🤔"] as const;
