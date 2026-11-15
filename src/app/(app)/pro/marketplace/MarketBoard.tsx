"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BadgeCheck, Package, Plus, Store, Upload, X } from "lucide-react";
import toast from "react-hot-toast";
import { createListing, uploadProMedia, withdrawListing } from "@/lib/actions/pro";

export type MarketListing = {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  currency: string;
  category: string | null;
  kind: "product" | "service";
  status: "pending" | "approved" | "rejected" | "removed";
  contact: string | null;
  created_at: string;
  owner_id: string;
  images: string[];
  owner: { id: string; username: string; display_name: string } | null;
};

const money = (n: number | null, currency: string) =>
  n === null ? "Price on request" : `${currency} ${n.toLocaleString()}`;

export function MarketBoard({
  listings,
  currentUserId,
  canList,
}: {
  listings: MarketListing[];
  currentUserId: string;
  canList: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [composing, setComposing] = useState(false);
  const [kind, setKind] = useState<"product" | "service">("product");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [category, setCategory] = useState("");
  const [contact, setContact] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<"all" | "product" | "service">("all");

  const visible = listings.filter((l) => l.status === "approved");
  const mine = listings.filter((l) => l.owner_id === currentUserId && l.status !== "approved");
  const shown = visible.filter((l) => filter === "all" || l.kind === filter);

  async function pickImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    const paths: string[] = [];
    for (const file of Array.from(files).slice(0, 4)) {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("folder", "marketplace");
      const res = await uploadProMedia(fd);
      if ("error" in res) { toast.error(res.error); continue; }
      paths.push(res.url);
    }
    setImages((list) => [...list, ...paths].slice(0, 4));
    setUploading(false);
  }

  function submit() {
    start(async () => {
      const res = await createListing({
        kind,
        title,
        description,
        price: price.trim() === "" ? undefined : Number(price),
        currency,
        category,
        contact,
        // The database stores paths, not URLs, so an admin can replace a file.
        imagePaths: images.map((u) => u.split("/pro-media/")[1] ?? u),
      });
      if ("error" in res) { toast.error(res.error); return; }
      setComposing(false);
      setTitle(""); setDescription(""); setPrice(""); setCategory(""); setContact(""); setImages([]);
      toast.success(res.message ?? "Sent for review.");
      router.refresh();
    });
  }

  function withdraw(id: string) {
    start(async () => {
      const res = await withdrawListing(id);
      if ("error" in res) { toast.error(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "product", "service"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-full text-sm font-semibold border capitalize"
            style={filter === f
              ? { borderColor: "var(--brand-gold)", background: "var(--brand-gold)", color: "var(--brand-green)" }
              : { borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            {f === "all" ? "Everything" : `${f}s`}
          </button>
        ))}
        {canList && !composing && (
          <button type="button" className="btn-primary text-sm ml-auto" onClick={() => setComposing(true)}>
            <Plus className="w-4 h-4" /> List something
          </button>
        )}
      </div>

      {composing && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold" style={{ color: "var(--text-primary)" }}>New listing</h2>
            <button type="button" onClick={() => setComposing(false)} className="p-1.5 rounded-lg border"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2">
            {(["product", "service"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className="px-3 py-1.5 rounded-full text-sm font-semibold border capitalize"
                style={kind === k ? { borderColor: "var(--brand-gold)", background: "var(--brand-gold)", color: "var(--brand-green)" }
                  : { borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                {k}
              </button>
            ))}
          </div>
          <input className="input" maxLength={160} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="input min-h-[80px]" maxLength={2000} placeholder="Describe it honestly. An admin reads this before anyone else."
            value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid sm:grid-cols-2 gap-2">
            <div className="flex gap-2">
              <input className="input max-w-[80px]" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
              <input className="input" inputMode="decimal" placeholder="Price (leave empty to ask)" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <input className="input" maxLength={60} placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
            <input className="input" maxLength={200} placeholder="How buyers reach you" value={contact} onChange={(e) => setContact(e.target.value)} />
            <label className="btn-ghost text-sm justify-center inline-flex items-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4" />{uploading ? "Uploading…" : "Add photos"}
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => void pickImages(e.target.files)} />
            </label>
          </div>
          {images.length > 0 && (
            <div className="flex gap-2">
              {images.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt="" className="w-16 h-16 rounded-lg object-cover" />
              ))}
            </div>
          )}
          <button type="button" className="btn-primary text-sm" disabled={pending || uploading} onClick={submit}>Send for review</button>
        </div>
      )}

      {mine.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Your listings awaiting a decision</h2>
          {mine.map((l) => (
            <div key={l.id} className="card p-3 flex items-center gap-3">
              <Store className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-secondary)" }} />
              <span className="text-sm font-semibold flex-1 truncate" style={{ color: "var(--text-primary)" }}>{l.title}</span>
              <span className="text-xs font-bold uppercase" style={{ color: l.status === "rejected" ? "#ef4444" : "var(--text-secondary)" }}>{l.status}</span>
              <button type="button" className="text-xs font-semibold" style={{ color: "#ef4444" }} disabled={pending} onClick={() => withdraw(l.id)}>Remove</button>
            </div>
          ))}
        </section>
      )}

      {shown.length === 0 ? (
        <div className="card p-8 text-center space-y-2">
          <Package className="w-8 h-8 mx-auto" style={{ color: "var(--text-secondary)" }} />
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Nothing on sale yet</p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Approved listings from PRO members show up here.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {shown.map((l) => (
            <article key={l.id} className="card overflow-hidden flex flex-col">
              {l.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.images[0]} alt="" className="w-full h-36 object-cover" />
              ) : (
                <div className="w-full h-24 flex items-center justify-center" style={{ background: "var(--border)" }}>
                  <Package className="w-6 h-6" style={{ color: "var(--text-secondary)" }} />
                </div>
              )}
              <div className="p-3 space-y-1.5 flex-1 flex flex-col">
                <div className="flex items-center gap-1.5">
                  <p className="font-bold truncate" style={{ color: "var(--text-primary)" }}>{l.title}</p>
                  <BadgeCheck className="w-4 h-4 flex-shrink-0 ml-auto" style={{ color: "var(--brand-gold)" }} />
                </div>
                <p className="text-sm font-extrabold" style={{ color: "var(--brand-green)" }}>{money(l.price, l.currency)}</p>
                {l.description && <p className="text-xs line-clamp-3" style={{ color: "var(--text-secondary)" }}>{l.description}</p>}
                <p className="text-xs mt-auto" style={{ color: "var(--text-secondary)" }}>
                  <span className="capitalize">{l.kind}</span>
                  {l.category ? ` · ${l.category}` : ""}
                  {l.owner && <> · <Link href={`/profile/${l.owner.username}`} className="font-semibold hover:underline" style={{ color: "rgb(var(--a-800))" }}>{l.owner.display_name}</Link></>}
                </p>
                {l.contact && <p className="text-xs font-semibold break-all" style={{ color: "var(--text-primary)" }}>{l.contact}</p>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
