"use client";

import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { CheckCircle, Mail } from "lucide-react";

export default function ContactPage() {
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", message: "" });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // In production this would send to a support endpoint
    setSent(true);
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      <div className="max-w-lg mx-auto px-4 py-16 flex-1 w-full">
        <div className="flex justify-center mb-8"><Logo size="md" href="/" /></div>
        <h1 className="text-3xl font-extrabold text-center text-[var(--text-primary)] mb-2">Contact Us</h1>
        <p className="text-center text-[var(--text-secondary)] mb-10">Have a question or feedback? We&apos;d love to hear from you.</p>

        {sent ? (
          <div className="card p-8 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Message sent!</h2>
            <p className="text-[var(--text-secondary)] text-sm">We&apos;ll get back to you as soon as possible.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card p-6 space-y-4">
            <Input label="Your name" type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} icon={<Mail className="w-4 h-4" />} required />
            <Textarea label="Message" value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} rows={5} required />
            <Button type="submit" className="w-full" size="lg">Send message</Button>
          </form>
        )}
      </div>
      <Footer />
    </div>
  );
}
