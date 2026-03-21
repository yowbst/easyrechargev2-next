"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { t } from "@/lib/i18n/dictionaries";
import { Mail, Send, Loader2, User, Users, Building2 } from "lucide-react";

interface ContactFormProps {
  lang: string;
  dictionary: Record<string, string>;
}

const P = "pages.contact";

export function ContactForm({ lang, dictionary }: ContactFormProps) {
  const d = (key: string, vars?: Record<string, string | number>) => t(dictionary, key, vars);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    firstName: "", lastName: "", email: "", phone: "", phoneCountry: "CH",
    company: "", streetName: "", streetNb: "", postalCode: "", locality: "",
    canton: "", country: "CH", subject: "", message: "",
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email);
  const isFormValid =
    formData.firstName.trim() && formData.lastName.trim() &&
    formData.email && isEmailValid &&
    formData.subject.trim() && formData.message.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setSubmitted(true);
      } else {
        setError(d(`${P}.toasts.error.description`));
      }
    } catch {
      setError(d(`${P}.toasts.error.description`));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl text-center space-y-4">
        <Mail className="h-12 w-12 text-primary mx-auto" />
        <h2 className="font-heading text-2xl font-bold">{d(`${P}.toasts.success.title`)}</h2>
        <p className="text-muted-foreground">{d(`${P}.toasts.success.description`)}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <div className="text-center space-y-3 mb-10">
        <h1 className="font-heading text-3xl md:text-4xl font-bold">{d(`${P}.hero.title`)}</h1>
        <p className="text-muted-foreground text-lg">{d(`${P}.hero.subtitle`)}</p>
      </div>

      <Card className="p-6 md:p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName"><User className="inline h-3.5 w-3.5 mr-1" />{d(`${P}.form.firstName`)} *</Label>
              <Input id="firstName" value={formData.firstName} onChange={(e) => handleChange("firstName", e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName"><Users className="inline h-3.5 w-3.5 mr-1" />{d(`${P}.form.lastName`)} *</Label>
              <Input id="lastName" value={formData.lastName} onChange={(e) => handleChange("lastName", e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email"><Mail className="inline h-3.5 w-3.5 mr-1" />{d(`${P}.form.email`)} *</Label>
              <Input id="email" type="email" value={formData.email} onChange={(e) => handleChange("email", e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{d(`${P}.form.phone`)}</Label>
              <Input id="phone" type="tel" value={formData.phone} onChange={(e) => handleChange("phone", e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="company"><Building2 className="inline h-3.5 w-3.5 mr-1" />{d(`${P}.form.company`)}</Label>
            <Input id="company" value={formData.company} onChange={(e) => handleChange("company", e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="streetName">{d(`${P}.form.address`)}</Label>
              <Input id="streetName" value={formData.streetName} onChange={(e) => handleChange("streetName", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="streetNb">N°</Label>
              <Input id="streetNb" value={formData.streetNb} onChange={(e) => handleChange("streetNb", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="postalCode">{d(`${P}.form.postalCode`)}</Label>
              <Input id="postalCode" value={formData.postalCode} onChange={(e) => handleChange("postalCode", e.target.value)} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="locality">{d(`${P}.form.locality`)}</Label>
              <Input id="locality" value={formData.locality} onChange={(e) => handleChange("locality", e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">{d(`${P}.form.subject`)} *</Label>
            <Input id="subject" value={formData.subject} onChange={(e) => handleChange("subject", e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">{d(`${P}.form.message`)} *</Label>
            <Textarea id="message" rows={5} value={formData.message} onChange={(e) => handleChange("message", e.target.value)} required />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={!isFormValid || isSubmitting} className="w-full">
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />{d(`${P}.form.submitting`)}</>
            ) : (
              <><Send className="h-4 w-4 mr-2" />{d(`${P}.form.submit`)}</>
            )}
          </Button>
        </form>
      </Card>
    </div>
  );
}
