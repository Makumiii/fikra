import type { HTMLAttributes } from "react";
import type { Profile, Viewer } from "../lib/models";
import { avatarPreviewUrl } from "../lib/avatar";

type Identity = Pick<Profile, "displayName" | "avatarKey" | "avatarSeed" | "avatarStyle"> | Pick<Viewer, "displayName" | "avatarKey" | "avatarSeed" | "avatarStyle">;

function firstNameInitial(displayName: string) {
  return displayName.trim().split(/\s+/)[0]?.slice(0, 1).toUpperCase() || "?";
}

export function Avatar({ identity, className = "", alt = "", ...props }: { identity: Identity; className?: string; alt?: string } & Omit<HTMLAttributes<HTMLSpanElement>, "className" | "children">) {
  const source = identity.avatarKey ? `/media/${encodeURIComponent(identity.avatarKey)}` : identity.avatarSeed ? avatarPreviewUrl(identity.avatarStyle, identity.avatarSeed) : null;
  return <span className={`avatar ${className}`.trim()} {...props}>{source ? <img src={source} alt={alt} loading="lazy" /> : firstNameInitial(identity.displayName)}</span>;
}

export function initialFor(displayName: string) {
  return firstNameInitial(displayName);
}
