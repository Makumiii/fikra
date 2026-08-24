import { ArrowLeft, Camera, MagnifyingGlassMinus, MagnifyingGlassPlus, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import type { Profile } from "../lib/models";
import { avatarPreviewUrl, type AvatarStyle } from "../lib/avatar";
import { bannerPreviewUrl, type BannerStyle } from "../lib/banner";
import { fileSavings, optimizeImage, replaceInputFile } from "../lib/image.client";
import { AvatarPicker } from "./avatar-picker";
import { BannerPicker } from "./banner-picker";

interface ProfileLink { label: string; url: string }
interface CropState { kind: "avatar" | "banner"; file: File; input: HTMLInputElement; url: string; zoom: number; x: number; y: number }
const ACCEPTED_IMAGES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export function ProfileEditor({ profile, profileLink }: { profile: Profile; profileLink?: ProfileLink }) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const dialog = useRef<HTMLDialogElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const drag = useRef<{ clientX: number; clientY: number; x: number; y: number } | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [bannerRemoved, setBannerRemoved] = useState(false);
  const [avatarChoiceSeed, setAvatarChoiceSeed] = useState<string | null>(profile.avatarSeed);
  const [avatarChoiceStyle, setAvatarChoiceStyle] = useState<AvatarStyle>(profile.avatarStyle);
  const [bannerChoiceSeed, setBannerChoiceSeed] = useState<string | null>(profile.bannerSeed);
  const [bannerChoiceStyle, setBannerChoiceStyle] = useState<BannerStyle>(profile.bannerStyle || "shapes");
  const [avatarMode, setAvatarMode] = useState<"keep" | "upload" | "dicebear" | "remove">(profile.avatarSeed ? "dicebear" : profile.avatarKey ? "upload" : "keep");
  const [bannerMode, setBannerMode] = useState<"keep" | "upload" | "dicebear" | "remove">(profile.bannerSeed ? "dicebear" : profile.bannerKey ? "upload" : "keep");
  const [crop, setCrop] = useState<CropState | null>(null);
  const [imageStatus, setImageStatus] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const saving = fetcher.state !== "idle";

  useEffect(() => { if (fetcher.state === "idle" && fetcher.data?.ok) dialog.current?.close(); }, [fetcher.data, fetcher.state]);
  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    if (crop) URL.revokeObjectURL(crop.url);
  }, [avatarPreview, bannerPreview, crop]);

  function chooseImage(input: HTMLInputElement, file: File | undefined, kind: "avatar" | "banner") {
    if (!file) return;
    setImageError(null);
    if (!ACCEPTED_IMAGES.includes(file.type)) { input.value = ""; setImageError("Choose a JPEG, PNG, WebP, or AVIF image."); return; }
    if (file.size > 8 * 1024 * 1024) { input.value = ""; setImageError("Images must be under 8 MB."); return; }
    if (kind === "avatar") setAvatarRemoved(false);
    else { setBannerRemoved(false); setBannerMode("upload"); setBannerChoiceSeed(null); }
    if (kind === "avatar") { setAvatarMode("upload"); setAvatarChoiceSeed(null); }
    setCrop({ kind, file, input, url: URL.createObjectURL(file), zoom: 1, x: 0.5, y: 0.5 });
  }

  function removeImage(kind: "avatar" | "banner") {
    setImageError(null);
    setImageStatus(`${kind === "avatar" ? "Profile picture" : "Banner image"} will be removed when you save.`);
    if (kind === "avatar") {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarPreview(null);
      setAvatarRemoved(true);
      setAvatarMode("remove");
      setAvatarChoiceSeed(null);
      if (avatarInput.current) avatarInput.current.value = "";
    } else {
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
      setBannerPreview(null);
      setBannerRemoved(true);
      setBannerMode("remove");
      setBannerChoiceSeed(null);
      if (bannerInput.current) bannerInput.current.value = "";
    }
  }

  function resetMediaDraft() {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    setAvatarPreview(null);
    setBannerPreview(null);
    setAvatarRemoved(false);
    setBannerRemoved(false);
    setAvatarChoiceSeed(profile.avatarSeed);
    setAvatarChoiceStyle(profile.avatarStyle);
    setBannerChoiceSeed(profile.bannerSeed);
    setBannerChoiceStyle(profile.bannerStyle || "shapes");
    setAvatarMode(profile.avatarSeed ? "dicebear" : profile.avatarKey ? "upload" : "keep");
    setBannerMode(profile.bannerSeed ? "dicebear" : profile.bannerKey ? "upload" : "keep");
    setImageStatus(null);
    setImageError(null);
    if (avatarInput.current) avatarInput.current.value = "";
    if (bannerInput.current) bannerInput.current.value = "";
  }

  function closeCrop() {
    if (!crop) return;
    crop.input.value = "";
    URL.revokeObjectURL(crop.url);
    setCrop(null);
  }

  async function applyCrop() {
    if (!crop) return;
    try {
      const preset = crop.kind === "avatar" ? { maxWidth: 512, maxHeight: 512, aspect: 1, quality: 0.86 } : { maxWidth: 1500, maxHeight: 500, aspect: 3, quality: 0.84 };
      const optimized = await optimizeImage(crop.file, { ...preset, zoom: crop.zoom, positionX: crop.x, positionY: crop.y });
      replaceInputFile(crop.input, optimized);
      const previewUrl = URL.createObjectURL(optimized);
      setImageStatus(`${crop.kind === "avatar" ? "Profile picture" : "Banner"}: ${fileSavings(crop.file.size, optimized.size)}`);
      if (crop.kind === "avatar") { setAvatarMode("upload"); setAvatarChoiceSeed(null); setAvatarPreview((old) => { if (old) URL.revokeObjectURL(old); return previewUrl; }); }
      else setBannerPreview((old) => { if (old) URL.revokeObjectURL(old); return previewUrl; });
      URL.revokeObjectURL(crop.url);
      setCrop(null);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "The image could not be prepared.");
    }
  }

  function moveCrop(event: React.PointerEvent<HTMLDivElement>) {
    if (!crop || !drag.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, drag.current.x - (event.clientX - drag.current.clientX) / bounds.width / crop.zoom));
    const y = Math.max(0, Math.min(1, drag.current.y - (event.clientY - drag.current.clientY) / bounds.height / crop.zoom));
    setCrop({ ...crop, x, y });
  }

  const bannerSource = !bannerRemoved
    ? bannerPreview || (bannerChoiceSeed ? bannerPreviewUrl(bannerChoiceStyle, bannerChoiceSeed) : profile.bannerKey ? `/media/${encodeURIComponent(profile.bannerKey)}` : null)
    : null;

  return <>
    <button type="button" className="soft-button edit-profile-button" onClick={() => dialog.current?.showModal()}>Edit profile</button>
    <dialog ref={dialog} className="profile-edit-dialog" onClose={resetMediaDraft} onCancel={(event) => { if (crop) { event.preventDefault(); closeCrop(); } }}>
      <fetcher.Form method="post" action="/actions/profile" encType="multipart/form-data" className="profile-edit-form">
        <input type="hidden" name="removeAvatar" value={avatarRemoved ? "1" : "0"} />
        <input type="hidden" name="removeBanner" value={bannerRemoved ? "1" : "0"} />
        <input type="hidden" name="bannerMode" value={bannerMode} />
        <input type="hidden" name="bannerSeed" value={bannerChoiceSeed || ""} />
        <input type="hidden" name="bannerStyle" value={bannerChoiceStyle} />
        <input type="hidden" name="avatarMode" value={avatarMode} />
        <input type="hidden" name="avatarSeed" value={avatarChoiceSeed || ""} />
        <input type="hidden" name="avatarStyle" value={avatarChoiceStyle} />
        <header><button type="button" className="icon-button" onClick={() => dialog.current?.close()} aria-label="Close profile editor"><X size={20} /></button><h2>Edit profile</h2><button className="primary-button profile-save" disabled={saving || Boolean(crop)}>{saving ? "Saving…" : "Save"}</button></header>
        <div className="profile-edit-banner" style={bannerSource ? { backgroundImage: `url(${bannerSource})` } : undefined}>
          <div className="image-edit-actions"><label className="image-edit-control"><Camera size={21} weight="fill" /><span className="sr-only">Choose a banner image</span><input ref={bannerInput} type="file" name="banner" accept={ACCEPTED_IMAGES.join(",")} onChange={(event) => chooseImage(event.currentTarget, event.currentTarget.files?.[0], "banner")} /></label>{!bannerRemoved && bannerSource ? <button type="button" className="image-edit-control" onClick={() => removeImage("banner")} aria-label="Remove banner image"><X size={21} weight="bold" /></button> : null}</div>
        </div>
        <BannerPicker selectedSeed={bannerChoiceSeed} selectedStyle={bannerChoiceStyle} onSelect={(style, seed) => { if (bannerPreview) URL.revokeObjectURL(bannerPreview); setBannerPreview(null); setBannerChoiceStyle(style); setBannerChoiceSeed(seed); setBannerMode("dicebear"); setBannerRemoved(false); if (bannerInput.current) bannerInput.current.value = ""; }} />
        <div className="profile-edit-avatar avatar">{!avatarRemoved && (avatarPreview || avatarChoiceSeed || profile.avatarKey) ? <img src={avatarPreview || (avatarChoiceSeed ? avatarPreviewUrl(avatarChoiceStyle, avatarChoiceSeed) : `/media/${encodeURIComponent(profile.avatarKey || "")}`)} alt="New profile preview" /> : profile.displayName.trim().slice(0, 1).toUpperCase()}<div className="image-edit-actions"><label className="image-edit-control"><Camera size={20} weight="fill" /><span className="sr-only">Choose a profile picture</span><input ref={avatarInput} type="file" name="avatar" accept={ACCEPTED_IMAGES.join(",")} onChange={(event) => chooseImage(event.currentTarget, event.currentTarget.files?.[0], "avatar")} /></label>{!avatarRemoved && (avatarPreview || avatarChoiceSeed || profile.avatarKey) ? <button type="button" className="image-edit-control" onClick={() => removeImage("avatar")} aria-label="Remove profile picture"><X size={20} weight="bold" /></button> : null}</div></div>
        <div className="profile-avatar-picker"><AvatarPicker selectedSeed={avatarChoiceSeed} selectedStyle={avatarChoiceStyle} onSelect={(style, seed) => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); setAvatarPreview(null); setAvatarChoiceStyle(style); setAvatarChoiceSeed(seed); setAvatarMode("dicebear"); setAvatarRemoved(false); if (avatarInput.current) avatarInput.current.value = ""; }} label="Or choose a DiceBear avatar" includeHiddenFields={false} /></div>
        <div className="profile-edit-fields">
          <label className="floating-field"><span>Name</span><input name="displayName" defaultValue={profile.displayName} maxLength={60} required /></label>
          <label className="floating-field"><span>Handle</span><div><b>@</b><input name="handle" defaultValue={profile.handle} maxLength={24} pattern="[a-zA-Z0-9_]{3,24}" required /></div></label>
          <label className="floating-field"><span>Bio</span><textarea name="bio" defaultValue={profile.bio} maxLength={200} rows={3} /></label>
          <label className="floating-field"><span>Location</span><input name="location" defaultValue={profile.location || ""} maxLength={80} /></label>
          <label className="floating-field"><span>Website</span><input type="url" name="linkUrl" defaultValue={profileLink?.url || ""} placeholder="https://" /></label>
          <label className="floating-field"><span>Website label</span><input name="linkLabel" defaultValue={profileLink?.label || ""} maxLength={50} /></label>
          <details className="about-edit-fields"><summary>About page</summary><div><label className="floating-field"><span>Introduction</span><textarea name="aboutIntro" defaultValue={profile.aboutIntro} maxLength={500} rows={3} /></label><label className="floating-field"><span>Section heading</span><input name="aboutHeading" defaultValue={profile.aboutHeading} maxLength={80} /></label><label className="floating-field"><span>Section text</span><textarea name="aboutBody" defaultValue={profile.aboutBody} maxLength={1000} rows={5} /></label></div></details>
          <p className="image-upload-note" aria-live="polite">{imageStatus || "Images are resized and compressed before upload · 8 MB source maximum"}</p>
          {imageError ? <p className="form-error" role="alert">{imageError}</p> : null}{fetcher.data?.error ? <p className="form-error" role="alert">{fetcher.data.error}</p> : null}
        </div>
      </fetcher.Form>
      {crop ? <section className="media-crop-step" aria-label={`Crop ${crop.kind}`}>
        <header><button type="button" className="icon-button" onClick={closeCrop} aria-label="Back to profile editor"><ArrowLeft size={21} /></button><h2>Edit media</h2><button type="button" className="primary-button" onClick={() => void applyCrop()}>Apply</button></header>
        <div className={`crop-stage ${crop.kind}`} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { clientX: event.clientX, clientY: event.clientY, x: crop.x, y: crop.y }; }} onPointerMove={moveCrop} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          <div className="crop-image"><img src={crop.url} alt="Crop preview" draggable={false} style={{ objectPosition: `${crop.x * 100}% ${crop.y * 100}%`, transform: `scale(${crop.zoom})` }} /></div><div className="crop-mask" />
        </div>
        <div className="crop-zoom"><MagnifyingGlassMinus size={18} /><input type="range" min="1" max="3" step="0.01" value={crop.zoom} onChange={(event) => setCrop({ ...crop, zoom: Number(event.target.value) })} aria-label="Zoom image" /><MagnifyingGlassPlus size={18} /></div>
        <p>Drag to reposition · pinch or use the slider to zoom</p>
      </section> : null}
    </dialog>
  </>;
}
