"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BrandIdentity } from "@/components/brand-identity";
import { LanguageToggle } from "@/components/language-toggle";
import { useLanguage } from "@/i18n/language-context";
import styles from "./governance-dashboard.module.css";

type GovernanceIdentity = {
  displayName: string;
  publicId: string;
};

type Team = {
  id: string;
  publicId: string;
  label: string;
  teamType: string;
  capacity: number;
  memberCount: number;
  status: string;
  leadPublicId: string | null;
  members: Array<{ publicId: string; role: string; availability: string }>;
};

type RegistrationRequest = {
  id: string;
  publicId: string;
  reviewerPublicId: string;
  teamPublicId: string;
  teamLabel: string;
  teamType: string;
  status: string;
  approvalCount: number;
  approvedByMe: boolean;
  requestedAt: string;
};

type Snapshot = {
  teams: Team[];
  requests: RegistrationRequest[];
  metrics: { teams: number; activeTeams: number; protectedTeams: number; pendingApprovals: number };
};

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function GovernanceDashboard({
  identity,
  onLogout,
}: {
  identity: GovernanceIdentity;
  onLogout: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [inviteBundle, setInviteBundle] = useState<{ publicId: string; inviteCodes: string[] } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/governance", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(t(result.error?.message ?? "Governance data could not be loaded."));
      setSnapshot(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? t(caught.message) : t("Governance data could not be loaded."));
    }
  }, [t]);

  useEffect(() => {
    let active = true;
    void fetch("/api/governance", { cache: "no-store" })
      .then(async (response) => ({ response, result: await response.json() }))
      .then(({ response, result }) => {
        if (!response.ok) throw new Error(t(result.error?.message ?? "Governance data could not be loaded."));
        if (active) setSnapshot(result.data);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? t(caught.message) : t("Governance data could not be loaded."));
      });
    return () => { active = false; };
  }, [t]);

  const createTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/governance/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: form.get("label"), teamType: form.get("teamType") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(t(result.error?.message ?? "The team could not be created."));
      setInviteBundle(result.data);
      event.currentTarget.reset();
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? t(caught.message) : t("The team could not be created."));
    } finally {
      setSaving(false);
    }
  };

  const decide = async (requestId: string, decision: "approve" | "reject") => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/governance/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, decision }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(t(result.error?.message ?? "The decision could not be recorded."));
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? t(caught.message) : t("The decision could not be recorded."));
    } finally {
      setSaving(false);
    }
  };

  const metrics = useMemo(
    () => [
      ["Reviewer teams", snapshot?.metrics.teams ?? 0, "Five protected seats per team"],
      ["Operational", snapshot?.metrics.activeTeams ?? 0, "Fully staffed and routing-ready"],
      ["Oversight", snapshot?.metrics.protectedTeams ?? 0, "Leadership-conflict separation"],
      ["Approvals", snapshot?.metrics.pendingApprovals ?? 0, "Two-person authorization queue"],
    ],
    [snapshot],
  );

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link className="brand" href="/"><BrandIdentity /></Link>
        <nav>
          <a href="#overview" className={styles.active}><i /> {t("Governance overview")}</a>
          <a href="#teams"><i /> {t("Reviewer teams")}</a>
          <a href="#approvals"><i /> {t("Access approvals")}</a>
        </nav>
        <div className={styles.privacyCard}>
          <span>{t("Privacy boundary")}</span>
          <strong>{t("Governance only")}</strong>
          <p>{t("No report, evidence, reporter identity, or case conversation is available here.")}</p>
        </div>
        <button type="button" onClick={() => void onLogout()}>{t("Sign out")}</button>
      </aside>

      <section className={styles.main}>
        <header className={styles.header} id="overview">
          <div><p>SilentSignals / {t("Governance")}</p><h1>{t("Build trust without seeing cases.")}</h1></div>
          <div className={styles.headerActions}><LanguageToggle /><div className={styles.identity}><span>G</span><p><strong>{identity.displayName}</strong><small>{identity.publicId}</small></p></div></div>
        </header>

        <div className={styles.boundaryBanner}>
          <span aria-hidden="true">✓</span>
          <div><strong>{t("Case-content isolation is active")}</strong><p>{t("Dean/VC accounts can form teams and authorize pseudonymous reviewers only.")}</p></div>
        </div>

        <div className={styles.metrics}>
          {metrics.map(([title, value, description], index) => (
            <article style={{ animationDelay: `${index * 70}ms` }} key={String(title)}>
              <p>{t(String(title))}</p><strong>{value}</strong><span>{t(String(description))}</span>
            </article>
          ))}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.grid}>
          <section className={styles.panel} id="teams">
            <div className={styles.panelHead}><div><p>{t("Protected structure")}</p><h2>{t("Reviewer teams")}</h2></div><button onClick={() => void refresh()} type="button">{t("Refresh")}</button></div>
            <div className={styles.teamList}>
              {snapshot?.teams.length ? snapshot.teams.map((team, index) => (
                <article className={styles.teamCard} style={{ animationDelay: `${index * 55}ms` }} key={team.id}>
                  <div className={styles.teamTop}>
                    <div><span>{team.publicId}</span><h3>{team.label}</h3><p>{label(team.teamType)}</p></div>
                    <b className={team.status === "active" ? styles.ready : ""}>{label(team.status)}</b>
                  </div>
                  <div className={styles.capacity}><span style={{ width: `${(team.memberCount / team.capacity) * 100}%` }} /></div>
                  <div className={styles.seats}>
                    {Array.from({ length: 5 }, (_, seat) => {
                      const member = team.members[seat];
                      return <div className={member ? styles.filledSeat : ""} key={seat}><i />{member ? <p><strong>{member.publicId}</strong><small>{member.role === "lead" ? t("Lead Reviewer") : t(label(member.availability))}</small></p> : <p><strong>{t("Open seat")}</strong><small>{t("Invite required")}</small></p>}</div>;
                    })}
                  </div>
                  <footer><span>{team.memberCount}/5 seats filled</span><strong>{team.leadPublicId ? `Lead · ${team.leadPublicId}` : "Lead assigned to first approval"}</strong></footer>
                </article>
              )) : <div className={styles.empty}>{t("No reviewer teams yet. Create the first five-seat team.")}</div>}
            </div>
          </section>

          <aside className={styles.createPanel}>
            <p>{t("Team builder")}</p><h2>{t("Create a protected team")}</h2>
            <span>{t("Exactly five pseudonymous reviewer seats are generated. Invite codes are shown once.")}</span>
            <form onSubmit={createTeam}>
              <label>{t("Team label")}<input name="label" placeholder={t("Ethics Review · A")} minLength={3} maxLength={80} required /></label>
              <label>{t("Routing boundary")}<select name="teamType"><option value="committee">{t("Standard committee")}</option><option value="independent_oversight">{t("Independent oversight")}</option></select></label>
              <button disabled={saving} type="submit">{t(saving ? "Creating…" : "Create team + 5 slots")}</button>
            </form>
            {inviteBundle && (
              <div className={styles.invites}>
                <p>Copy now · {inviteBundle.publicId}</p>
                {inviteBundle.inviteCodes.map((code, index) => <button type="button" onClick={() => void navigator.clipboard.writeText(code)} key={code}><span>{t("Seat")} {index + 1}</span><strong>{code}</strong><small>{t("Copy")}</small></button>)}
              </div>
            )}
          </aside>
        </div>

        <section className={styles.approvals} id="approvals">
          <div className={styles.panelHead}><div><p>{t("Blind authorization")}</p><h2>{t("Reviewer registration requests")}</h2></div><span>{t("2 approvals required")}</span></div>
          <div className={styles.requestList}>
            {snapshot?.requests.filter((request) => request.status === "pending").length ? snapshot.requests.filter((request) => request.status === "pending").map((request) => (
              <article key={request.id}>
                <div className={styles.requestAvatar}>R</div>
                <div><p>{request.publicId}</p><h3>{request.reviewerPublicId}</h3><span>{request.teamLabel} · {request.teamPublicId}</span></div>
                <div className={styles.approvalProgress}><strong>{request.approvalCount}/2</strong><span><i className={request.approvalCount >= 1 ? styles.complete : ""} /><i className={request.approvalCount >= 2 ? styles.complete : ""} /></span><small>{t(request.approvedByMe ? "Your approval recorded" : "Awaiting your decision")}</small></div>
                <div className={styles.actions}><button disabled={saving || request.approvedByMe} onClick={() => void decide(request.id, "approve")} type="button">{t("Approve slot")}</button><button disabled={saving} onClick={() => void decide(request.id, "reject")} type="button">{t("Reject")}</button></div>
              </article>
            )) : <div className={styles.empty}>{t("No registration requests are waiting for approval.")}</div>}
          </div>
        </section>
      </section>
    </main>
  );
}
