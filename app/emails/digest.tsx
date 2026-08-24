import { Img, Section, Text } from "@react-email/components";
import { ActionButton, EmailLayout, PostLabel, Topics, colors, styles } from "./shared";
import type { EmailTemplateData } from "./types";

type Props = Extract<EmailTemplateData, { template: "digest" }>;

export function DigestEmail({
  frequency = "daily",
  posts = [],
  siteUrl = "https://example.com",
  siteName = "Fikra",
  unsubscribeUrl = "https://example.com/unsubscribe?token=preview-token",
}: Props) {
  const label = frequency === "daily" ? "Daily digest" : "Weekly digest";
  return (
    <EmailLayout preview={`${frequency === "daily" ? "Today" : "This week"} on ${siteName}.`} siteUrl={siteUrl} siteName={siteName} footer="unsubscribe" unsubscribeUrl={unsubscribeUrl}>
      <Text style={styles.eyebrow}>{label}</Text>
      <h1 style={styles.heading}>A few things worth your scroll.</h1>
      <Text style={styles.paragraph}>The latest posts, gathered in one small email so your inbox does not become a second timeline.</Text>
      {posts.map((post, index) => (
        <Section key={`${post.url}-${index}`} style={{ borderTop: index ? `1px solid ${colors.line}` : undefined, padding: "18px 0 2px" }}>
          {index === 0 && post.coverUrl ? <Img src={post.coverUrl} alt={post.title} width="536" style={{ borderRadius: "12px", display: "block", margin: "0 0 16px", maxWidth: "100%" }} /> : null}
          <PostLabel kind={post.kind} />
          <Text style={styles.postTitle}><a href={post.url} style={{ color: colors.ink, textDecoration: "none" }}>{post.title}</a></Text>
          <Text style={styles.postExcerpt}>{post.excerpt}</Text>
          <Topics topics={post.topics} />
        </Section>
      ))}
      <Section style={{ marginTop: "20px" }}><ActionButton href={siteUrl}>View the timeline</ActionButton></Section>
    </EmailLayout>
  );
}

export default DigestEmail;

DigestEmail.PreviewProps = {
  template: "digest",
  frequency: "weekly",
  posts: [
    { kind: "article", title: "The web is still worth making", excerpt: "A practical note on building small, personal corners of the internet.", url: "https://example.com/post/example-article", topics: ["Building"] },
    { kind: "thought", title: "A tiny thought", excerpt: "The best tools disappear until you need them.", url: "https://example.com/post/example-thought" },
  ],
  siteUrl: "https://example.com",
  siteName: "Fikra",
  unsubscribeUrl: "https://example.com/unsubscribe?token=preview-token",
} satisfies Props;
