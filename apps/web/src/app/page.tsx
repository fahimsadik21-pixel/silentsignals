"use client";

import { MotionReveal } from "@/components/motion-reveal";
import { BrandIdentity } from "@/components/brand-identity";
import { LanguageToggle } from "@/components/language-toggle";
import { useLanguage } from "@/i18n/language-context";

const trustPoints = [
  "No account required",
  "Private case tracking",
  "Evidence metadata protection",
];

const pathways = [
  {
    eyebrow: "Start safely",
    title: "Submit a report",
    description:
      "Share a concern without adding your name, student ID, email, or phone number.",
    href: "/report",
    action: "Begin a report",
    tone: "primary",
  },
  {
    eyebrow: "Continue privately",
    title: "Track your case",
    description:
      "Use your private tracking credentials to view progress or reply to an investigator.",
    href: "/track",
    action: "Open case tracking",
    tone: "secondary",
  },
];

export default function HomePage() {
  const { t } = useLanguage();

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="SilentSignals home">
          <BrandIdentity />
        </a>

        <nav className="main-nav" aria-label="Primary navigation">
          <a href="#how-it-works">{t("How it works")}</a>
          <a href="#safety">{t("Safety")}</a>
          <a href="#transparency">{t("Transparency")}</a>
        </nav>

        <div className="header-actions">
          <a className="reviewer-link" href="/reviewer">
            {t("Reviewer sign in")}
          </a>
          <a className="reviewer-link" href="/governance">
            {t("Dean / VC")}
          </a>
          <LanguageToggle />
          <a className="header-cta" href="/track">
            {t("Reporter / Victim access")}
          </a>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="status-label hero-entrance hero-delay-one">
            <span className="status-dot" aria-hidden="true" />
            {t("Independent and confidential reporting")}
          </div>
          <h1 className="hero-entrance hero-delay-two">
            {t("Speak up without putting your identity at risk.")}
          </h1>
          <p className="hero-summary hero-entrance hero-delay-three">
            {t("A secure channel for students, faculty, and staff to report misconduct, follow an investigation, and communicate without revealing who they are.")}
          </p>
          <div className="hero-actions hero-entrance hero-delay-four">
            <a className="button button-primary" href="/report">
              {t("Submit a report")}
            </a>
            <a className="button button-reviewer" href="/reviewer">
              <span aria-hidden="true">R</span>
              {t("Reviewer sign in")}
            </a>
            <a className="button button-secondary" href="/track">
              {t("Reporter / Victim access")}
            </a>
            <a className="button button-secondary" href="#how-it-works">
              {t("See how privacy works")}
            </a>
          </div>
          <ul
            className="trust-list hero-entrance hero-delay-five"
            aria-label="Privacy commitments"
          >
            {trustPoints.map((point) => (
              <li key={point}>
                <span aria-hidden="true">✓</span>
                {t(point)}
              </li>
            ))}
          </ul>
        </div>

        <aside className="assurance-panel panel-entrance" aria-label="Reporting assurance">
          <div className="assurance-header">
            <span className="assurance-index">01</span>
            <span className="assurance-badge">{t("Privacy by design")}</span>
          </div>
          <div className="assurance-graphic" aria-hidden="true">
            <div className="signal-ring signal-ring-one" />
            <div className="signal-ring signal-ring-two" />
            <div className="signal-core">S</div>
          </div>
          <div className="assurance-copy">
            <p>{t("What the reporting form does not ask for")}</p>
            <div className="redacted-lines" aria-hidden="true">
              <span>{t("Name")}</span>
              <span>{t("Email")}</span>
              <span>{t("Student ID")}</span>
              <span>{t("Phone")}</span>
            </div>
          </div>
        </aside>
      </section>

      <section className="pathways" id="how-it-works" aria-labelledby="pathway-title">
        <MotionReveal>
          <div className="section-heading">
            <div>
              <p>{t("Choose what you need")}</p>
              <h2 id="pathway-title">{t("A clear path at every stage.")}</h2>
            </div>
            <span className="section-note">{t("Designed for clarity under pressure")}</span>
          </div>
        </MotionReveal>

        <div className="pathway-grid">
          {pathways.map((pathway, index) => (
            <MotionReveal delay={index * 110} key={pathway.title}>
              <article className={`pathway-card pathway-card-${pathway.tone}`}>
                <div className="pathway-number">0{index + 1}</div>
                <p className="pathway-eyebrow">{t(pathway.eyebrow)}</p>
                <h3>{t(pathway.title)}</h3>
                <p>{t(pathway.description)}</p>
                <a href={pathway.href}>
                  {t(pathway.action)} <span aria-hidden="true">→</span>
                </a>
              </article>
            </MotionReveal>
          ))}
        </div>
      </section>

      <section className="principle-strip" id="safety">
        <p>{t("Designed for trust, not surveillance.")}</p>
        <span>
          {t("Protected case credentials · restricted committee access · independent escalation")}
        </span>
      </section>

      <section className="privacy-section" id="submit" aria-labelledby="submit-title">
        <MotionReveal className="privacy-copy">
          <p className="section-eyebrow">{t("Privacy architecture")}</p>
          <h2 id="submit-title">{t("Your identity should never become case data.")}</h2>
          <p className="section-description">
            {t("SilentSignals separates the person reporting from the information being investigated. The case moves forward without building a profile of the reporter.")}
          </p>
          <ol className="privacy-steps">
            <li>
              <span>01</span>
              <div>
                <strong>{t("Describe the concern")}</strong>
                <p>{t("Use structured prompts without entering personal identifiers.")}</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>{t("Protect the evidence")}</strong>
                <p>{t("Uploaded files pass through validation and metadata removal.")}</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>{t("Keep private access")}</strong>
                <p>{t("Only the private case credentials reconnect you to the report.")}</p>
              </div>
            </li>
          </ol>
        </MotionReveal>

        <MotionReveal className="credential-demo" delay={120}>
          <div className="credential-card">
            <div className="credential-topline">
              <span>{t("Private case receipt")}</span>
              <span className="credential-status">
                <i aria-hidden="true" /> {t("Protected")}
              </span>
            </div>
            <div className="credential-code">
              <span>{t("Tracking code")}</span>
              <strong>SIG–8F4K–29QX</strong>
            </div>
            <div className="credential-secret">
              <div>
                <span>{t("Private access key")}</span>
                <strong>•••• •••• •••• ••••</strong>
              </div>
              <span className="credential-lock" aria-hidden="true">
                ✓
              </span>
            </div>
            <div className="credential-message">
              <span aria-hidden="true">→</span>
              <p>{t("This receipt is shown once. SilentSignals cannot recover it for you.")}</p>
            </div>
          </div>
        </MotionReveal>
      </section>

      <section className="routing-section" id="track" aria-labelledby="routing-title">
        <MotionReveal className="routing-heading">
          <p className="section-eyebrow section-eyebrow-light">{t("Independent escalation")}</p>
          <h2 id="routing-title">{t("Authority should never investigate itself.")}</h2>
          <p>
            {t("Reports involving protected leadership roles follow a separate path to an independent oversight body. Internal reviewers cannot open or reassign them.")}
          </p>
        </MotionReveal>

        <MotionReveal className="routing-flow" delay={100}>
          <div className="route-node">
            <span>{t("Report received")}</span>
            <strong>{t("Protected target detected")}</strong>
          </div>
          <div className="route-connector" aria-hidden="true">
            <span />
          </div>
          <div className="route-node route-node-accent">
            <span>{t("Restricted route")}</span>
            <strong>{t("External oversight board")}</strong>
          </div>
        </MotionReveal>
      </section>

      <section
        className="transparency-section"
        id="transparency"
        aria-labelledby="transparency-title"
      >
        <MotionReveal className="transparency-heading">
          <p className="section-eyebrow">{t("Public accountability")}</p>
          <h2 id="transparency-title">{t("Transparency without exposing a case.")}</h2>
          <p>
            {t("The public dashboard reports institutional progress in aggregate. Individual submissions, messages, targets, and evidence always remain private.")}
          </p>
        </MotionReveal>
        <div className="metric-grid">
          {[
            ["Case volume", "Published in aggregate"],
            ["Resolution progress", "Updated by reporting period"],
            ["Response time", "Shown without case-level data"],
          ].map(([title, description], index) => (
            <MotionReveal delay={index * 90} key={title}>
              <article className="metric-card">
                <span>0{index + 1}</span>
                <h3>{t(title)}</h3>
                <p>{t(description)}</p>
              </article>
            </MotionReveal>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <a className="brand brand-footer" href="#top" aria-label="SilentSignals home">
          <BrandIdentity />
        </a>
        <p>{t("A safer channel for difficult conversations.")}</p>
        <div className="footer-links">
          <a href="#safety">{t("Safety")}</a>
          <a href="#transparency">{t("Transparency")}</a>
          <a href="/reviewer">{t("Reviewer portal")}</a>
          <a href="#top">{t("Back to top ↑")}</a>
        </div>
      </footer>
    </main>
  );
}
