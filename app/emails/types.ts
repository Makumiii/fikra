export type EmailSite = {
  siteUrl: string;
  siteName?: string;
};

export type EmailTemplateData =
  | {
      template: "magic-link";
      handle: string;
      url: string;
      siteUrl: string;
      siteName?: string;
    }
  | {
      template: "welcome";
      handle: string;
      timelineUrl: string;
      settingsUrl: string;
      siteUrl: string;
      siteName?: string;
      avatarUrl?: string;
    }
  | {
      template: "new-post";
      handle?: string;
      kind: "thought" | "article" | "link";
      title?: string;
      body: string;
      excerpt?: string;
      url: string;
      coverUrl?: string;
      topics?: string[];
      siteUrl: string;
      siteName?: string;
      unsubscribeUrl?: string;
    }
  | {
      template: "digest";
      frequency: "daily" | "weekly";
      posts: Array<{
        kind?: "thought" | "article" | "link";
        title: string;
        excerpt: string;
        url: string;
        coverUrl?: string;
        topics?: string[];
      }>;
      siteUrl: string;
      siteName?: string;
      unsubscribeUrl?: string;
    }
  | {
      template: "activity";
      activity: "mention" | "reply";
      actorName: string;
      actorHandle: string;
      actorAvatarUrl?: string;
      quote: string;
      url: string;
      siteUrl: string;
      siteName?: string;
      unsubscribeUrl?: string;
    };

export type EmailTemplateName = EmailTemplateData["template"];

export type EmailRenderResult = {
  html: string;
  text: string;
  unsubscribeUrl?: string;
};
