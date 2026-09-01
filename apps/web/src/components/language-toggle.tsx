"use client";

import { useLanguage } from "@/i18n/language-context";

export function LanguageToggle({ className = "language-button" }: { className?: string }) {
  const { language, toggleLanguage, t } = useLanguage();

  return (
    <button
      aria-label={t("Change language")}
      className={className}
      onClick={toggleLanguage}
      type="button"
    >
      {language === "en" ? "বাংলা" : "English"}
    </button>
  );
}
