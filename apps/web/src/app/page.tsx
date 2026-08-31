import { MotionReveal } from "@/components/motion-reveal";
import { BrandIdentity } from "@/components/brand-identity";

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
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="SilentSignals home">
          <BrandIdentity />
        </a>

        <nav className="main-nav" aria-label="Primary navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#safety">Safety</a>
          <a href="#transparency">Transparency</a>
        </nav>

        <div className="header-actions">
          <a className="reviewer-link" href="/reviewer">
            Reviewer sign in
          </a>
          <button className="language-button" type="button" aria-label="Change language">
            EN <span aria-hidden="true">/</span> বাংলা
          </button>
          <a className="header-cta" href="/track">
            Track a case
          </a>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="status-label hero-entrance hero-delay-one">
            <span className="status-dot" aria-hidden="true" />
            Independent and confidential reporting
          </div>
          <h1 className="hero-entrance hero-delay-two">
            Speak up without putting your identity at risk.
          </h1>
          <p className="hero-summary hero-entrance hero-delay-three">
            A secure channel for students, faculty, and staff to report misconduct,
            follow an investigation, and communicate without revealing who they are.
          </p>
          <div className="hero-actions hero-entrance hero-delay-four">
            <a className="button button-primary" href="/report">
              Submit a report
            </a>
            <a className="button button-reviewer" href="/reviewer">
              <span aria-hidden="true">R</span>
              Reviewer sign in
            </a>
            <a className="button button-secondary" href="#how-it-works">
              See how privacy works
            </a>
          </div>
          <ul
            className="trust-list hero-entrance hero-delay-five"
            aria-label="Privacy commitments"
          >
            {trustPoints.map((point) => (
              <li key={point}>
                <span aria-hidden="true">✓</span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <aside className="assurance-panel panel-entrance" aria-label="Reporting assurance">
          <div className="assurance-header">
            <span className="assurance-index">01</span>
            <span className="assurance-badge">Privacy by design</span>
          </div>
          <div className="assurance-graphic" aria-hidden="true">
            <div className="signal-ring signal-ring-one" />
            <div className="signal-ring signal-ring-two" />
            <div className="signal-core">S</div>
          </div>
          <div className="assurance-copy">
            <p>What the reporting form does not ask for</p>
            <div className="redacted-lines" aria-hidden="true">
              <span>Name</span>
              <span>Email</span>
              <span>Student ID</span>
              <span>Phone</span>
            </div>
          </div>
        </aside>
      </section>

      <section className="pathways" id="how-it-works" aria-labelledby="pathway-title">
        <MotionReveal>
          <div className="section-heading">
            <div>
              <p>Choose what you need</p>
              <h2 id="pathway-title">A clear path at every stage.</h2>
            </div>
            <span className="section-note">Designed for clarity under pressure</span>
          </div>
        </MotionReveal>

        <div className="pathway-grid">
          {pathways.map((pathway, index) => (
            <MotionReveal delay={index * 110} key={pathway.title}>
              <article className={`pathway-card pathway-card-${pathway.tone}`}>
                <div className="pathway-number">0{index + 1}</div>
                <p className="pathway-eyebrow">{pathway.eyebrow}</p>
                <h3>{pathway.title}</h3>
                <p>{pathway.description}</p>
                <a href={pathway.href}>
                  {pathway.action} <span aria-hidden="true">→</span>
                </a>
              </article>
            </MotionReveal>
          ))}
        </div>
      </section>

      <section className="principle-strip" id="safety">
        <p>Designed for trust, not surveillance.</p>
        <span>
          Protected case credentials · restricted committee access · independent escalation
        </span>
      </section>

      <section className="privacy-section" id="submit" aria-labelledby="submit-title">
        <MotionReveal className="privacy-copy">
          <p className="section-eyebrow">Privacy architecture</p>
          <h2 id="submit-title">Your identity should never become case data.</h2>
          <p className="section-description">
            SilentSignals separates the person reporting from the information being
            investigated. The case moves forward without building a profile of the reporter.
          </p>
          <ol className="privacy-steps">
            <li>
              <span>01</span>
              <div>
                <strong>Describe the concern</strong>
                <p>Use structured prompts without entering personal identifiers.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Protect the evidence</strong>
                <p>Uploaded files pass through validation and metadata removal.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Keep private access</strong>
                <p>Only the private case credentials reconnect you to the report.</p>
              </div>
            </li>
          </ol>
        </MotionReveal>

        <MotionReveal className="credential-demo" delay={120}>
          <div className="credential-card">
            <div className="credential-topline">
              <span>Private case receipt</span>
              <span className="credential-status">
                <i aria-hidden="true" /> Protected
              </span>
            </div>
            <div className="credential-code">
              <span>Tracking code</span>
              <strong>SIG–8F4K–29QX</strong>
            </div>
            <div className="credential-secret">
              <div>
                <span>Private access key</span>
                <strong>•••• •••• •••• ••••</strong>
              </div>
              <span className="credential-lock" aria-hidden="true">
                ✓
              </span>
            </div>
            <div className="credential-message">
              <span aria-hidden="true">→</span>
              <p>This receipt is shown once. SilentSignals cannot recover it for you.</p>
            </div>
          </div>
        </MotionReveal>
      </section>

      <section className="routing-section" id="track" aria-labelledby="routing-title">
        <MotionReveal className="routing-heading">
          <p className="section-eyebrow section-eyebrow-light">Independent escalation</p>
          <h2 id="routing-title">Authority should never investigate itself.</h2>
          <p>
            Reports involving protected leadership roles follow a separate path to an
            independent oversight body. Internal reviewers cannot open or reassign them.
          </p>
        </MotionReveal>

        <MotionReveal className="routing-flow" delay={100}>
          <div className="route-node">
            <span>Report received</span>
            <strong>Protected target detected</strong>
          </div>
          <div className="route-connector" aria-hidden="true">
            <span />
          </div>
          <div className="route-node route-node-accent">
            <span>Restricted route</span>
            <strong>External oversight board</strong>
          </div>
        </MotionReveal>
      </section>

      <section
        className="transparency-section"
        id="transparency"
        aria-labelledby="transparency-title"
      >
        <MotionReveal className="transparency-heading">
          <p className="section-eyebrow">Public accountability</p>
          <h2 id="transparency-title">Transparency without exposing a case.</h2>
          <p>
            The public dashboard reports institutional progress in aggregate. Individual
            submissions, messages, targets, and evidence always remain private.
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
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            </MotionReveal>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <a className="brand brand-footer" href="#top" aria-label="SilentSignals home">
          <BrandIdentity />
        </a>
        <p>A safer channel for difficult conversations.</p>
        <div className="footer-links">
          <a href="#safety">Safety</a>
          <a href="#transparency">Transparency</a>
          <a href="/reviewer">Reviewer portal</a>
          <a href="#top">Back to top ↑</a>
        </div>
      </footer>
    </main>
  );
}
