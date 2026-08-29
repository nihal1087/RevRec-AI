import { useState, useMemo } from 'react';
import { Search, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { WorkflowItem } from '../api/client';
import { PillBadge, RiskBadge, PillVariant } from './PillBadge';

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGES = [
  { key: '', label: 'All' },
  { key: 'RETRYING', label: 'Retrying' },
  { key: 'OUTREACH_SENT', label: 'Outreach' },
  { key: 'PROMISE_RECEIVED', label: 'PTP' },
  { key: 'RECOVERED', label: 'Recovered' },
  { key: 'HALTED', label: 'Halted' },
  { key: 'ESCALATED', label: 'Escalated' },
];

const PAGE_SIZE = 10;

// ─── Props ────────────────────────────────────────────────────────────────────

interface WorkflowTableProps {
  workflows: WorkflowItem[];
  selectedStage: string;
  onSelectStage: (stage: string) => void;
  onInspectWorkflow: (workflow: WorkflowItem) => void;
}

// ─── Stage badge helper ───────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: string }) {
  const variantMap: Record<string, PillVariant> = {
    RECOVERED: 'green',
    RETRYING: 'blue',
    OUTREACH_SENT: 'purple',
    PROMISE_RECEIVED: 'teal',
    HALTED: 'neutral',
    ESCALATED: 'red',
  };
  const variant = variantMap[stage] ?? 'neutral';
  const label =
    stage === 'OUTREACH_SENT'
      ? 'OUTREACH'
      : stage === 'PROMISE_RECEIVED'
      ? 'PTP'
      : stage.charAt(0) + stage.slice(1).toLowerCase().replace(/_/g, ' ');

  return (
    <PillBadge variant={variant}>
      {label}
    </PillBadge>
  );
}

// ─── Category tag helper ──────────────────────────────────────────────────────

function CategoryTag({ category }: { category?: string | null }) {
  const variantMap: Record<string, PillVariant> = {
    SOFT: 'green',
    HARD: 'red',
    NETWORK: 'blue',
    INTENT_DROP: 'amber',
    MANDATE_FAILURE: 'purple',
  };
  const variant = category ? variantMap[category] ?? 'neutral' : 'neutral';
  const label =
    category === 'INTENT_DROP'
      ? 'INTENT DROP'
      : category === 'MANDATE_FAILURE'
      ? 'MANDATE'
      : category ?? 'UNKNOWN';

  return (
    <PillBadge variant={variant}>
      {label}
    </PillBadge>
  );
}

// ─── Avatar initials ──────────────────────────────────────────────────────────

function Initials({ name }: { name: string }) {
  const parts = (name ?? '').trim().split(/\s+/);
  const initials =
    parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : (parts[0]?.[0] ?? '?').toUpperCase();

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        height: 30,
        borderRadius: '50%',
        backgroundColor: 'var(--bg-subtle)',
        border: '1px solid var(--border)',
        flexShrink: 0,
        fontSize: 11.5,
        fontWeight: 600,
        color: 'var(--text-soft)',
        userSelect: 'none',
      }}
    >
      {initials}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WorkflowTable({
  workflows,
  selectedStage,
  onSelectStage,
  onInspectWorkflow,
}: WorkflowTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return workflows.filter((w) => {
      const stageMatch =
        selectedStage === '' ||
        selectedStage === 'INTERCEPTED' ||
        (selectedStage === 'ACTIVE'
          ? w.stage !== 'RECOVERED' && w.stage !== 'HALTED' && w.stage !== 'ABANDONED'
          : w.stage === selectedStage);
      if (!stageMatch) return false;

      if (searchTerm.trim() === '') return true;

      const q = searchTerm.toLowerCase();
      return (
        // M18 fix: search by workflow ID and payment external ID (not just customerId)
        w.id.toLowerCase().includes(q) ||
        w.customer?.name?.toLowerCase().includes(q) ||        // M19 fix: optional chaining
        w.customer?.email?.toLowerCase().includes(q) ||
        w.customerId?.toLowerCase().includes(q) ||
        w.payment?.externalId?.toLowerCase().includes(q) ||   // M18 fix: match pay_ IDs
        (w.payment?.gatewayErrorCode ?? '').toLowerCase().includes(q)
      );
    });
  }, [workflows, selectedStage, searchTerm]);

  // Reset page when filter or search changes
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageIndex = Math.min(currentPage, totalPages);
  const paginatedWorkflows = filtered.slice(
    (pageIndex - 1) * PAGE_SIZE,
    pageIndex * PAGE_SIZE
  );

  const handleStageSelect = (stageKey: string) => {
    setCurrentPage(1);
    onSelectStage(stageKey);
  };

  const handleSearchChange = (val: string) => {
    setCurrentPage(1);
    setSearchTerm(val);
  };

  return (
    <div id="workflow-ledger-section" className="ds-card" style={{ overflow: 'hidden' }}>
      {/* ── Card Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 24px',
          borderBottom: '1px solid var(--border)',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="ds-section-title">Recovery State Ledger</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 7px',
                borderRadius: 999,
                backgroundColor: 'var(--bg-subtle)',
                color: 'var(--text-soft)',
                border: '1px solid var(--border)',
              }}
            >
              {filtered.length} active
            </span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-soft)', margin: '2px 0 0' }}>
            Deterministic state machine tracking each failed transaction
          </p>
        </div>

        <div style={{ position: 'relative', width: 260 }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: 11,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-faint)',
              pointerEvents: 'none',
            }}
          />
          <input
            className="ds-input"
            style={{ width: '100%', paddingLeft: 34, height: 36, fontSize: 13 }}
            type="text"
            placeholder="Filter by customer, ID, error..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
      </div>

      {/* ── Stage Filter Pills ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          overflowX: 'auto',
          gap: 6,
          padding: '12px 24px',
          backgroundColor: 'var(--bg-subtle)',
          borderBottom: '1px solid var(--border)',
          scrollbarWidth: 'none',
        }}
      >
        {STAGES.map(({ key, label }) => {
          const active = selectedStage === key;
          return (
            <button
              key={key}
              onClick={() => handleStageSelect(key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 28,
                padding: '0 12px',
                borderRadius: 6,
                border: `1px solid ${active ? 'var(--brand-border)' : 'var(--border)'}`,
                backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                color: active ? 'var(--text-strong)' : 'var(--text-soft)',
                fontWeight: active ? 600 : 400,
                fontSize: 12.5,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                boxShadow: active ? 'var(--shadow-xs)' : 'none',
                transition: 'background-color 0.12s ease',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Bounded Table Scroll Container (Max Height 440px with Sticky Header) ── */}
      <div
        style={{
          maxHeight: 440,
          overflowY: 'auto',
          overflowX: 'auto',
          scrollbarWidth: 'thin',
        }}
      >
        <table className="ds-table" style={{ width: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-subtle)' }}>
            <tr>
              <th style={{ width: '24%' }}>Customer & Workflow</th>
              <th style={{ width: '14%' }}>Amount At Risk</th>
              <th style={{ width: '16%' }}>RCA Classification</th>
              <th style={{ width: '14%' }}>Risk Tier</th>
              <th style={{ width: '14%' }}>Current Stage</th>
              <th style={{ width: '10%' }}>Attempts</th>
              <th style={{ width: '8%', textAlign: 'right' }}>Action</th>
            </tr>
          </thead>

          <tbody>
            {paginatedWorkflows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    textAlign: 'center',
                    padding: '48px 16px',
                    color: 'var(--text-faint)',
                    fontSize: 13.5,
                  }}
                >
                  No recovery workflows matching the active criteria.
                </td>
              </tr>
            ) : (
              paginatedWorkflows.map((workflow) => (
                <tr
                  key={workflow.id}
                  onClick={() => onInspectWorkflow(workflow)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Customer */}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Initials name={workflow.customer.name} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span
                          style={{
                            fontSize: 13.5,
                            fontWeight: 500,
                            color: 'var(--text-strong)',
                            lineHeight: '1.25',
                          }}
                        >
                          {workflow.customer.name}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--text-faint)',
                            fontFamily: 'monospace',
                            lineHeight: '1.2',
                          }}
                        >
                          {workflow.id.slice(0, 12)}…
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Amount */}
                  <td>
                    <div style={{ display: 'inline-flex', alignItems: 'baseline', fontVariantNumeric: 'tabular-nums' }}>
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 500,
                          color: 'var(--text-soft)',
                          marginRight: 2,
                        }}
                      >
                        ₹
                      </span>
                      <span
                        style={{
                          fontWeight: 600,
                          color: 'var(--text-strong)',
                          fontSize: 13.5,
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {(workflow.amountAtRiskInPaise / 100).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </td>

                  {/* RCA / Category */}
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                      <CategoryTag category={workflow.payment.declineCategory} />
                      {workflow.payment.gatewayErrorCode && (
                        <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'monospace' }}>
                          {workflow.payment.gatewayErrorCode}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Risk Tier */}
                  <td>
                    <RiskBadge
                      tier={
                        workflow.customer.riskTier ??
                        (workflow.customer.riskScore > 60 ? 'HIGH' : workflow.customer.riskScore > 30 ? 'MEDIUM' : 'LOW')
                      }
                      score={workflow.customer.paymentHistoryScore ?? (workflow.customer.riskScore > 60 ? 35 : workflow.customer.riskScore > 30 ? 65 : 90)}
                      showScore
                    />
                  </td>

                  {/* Stage */}
                  <td>
                    <StageBadge stage={workflow.stage} />
                  </td>

                  {/* Attempts */}
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-strong)' }}>
                        {workflow.retryCount} {workflow.retryCount === 1 ? 'retry' : 'retries'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                        {workflow.outreachCount} outreach
                      </span>
                    </div>
                  </td>

                  {/* Action */}
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="ds-btn ds-btn-ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        onInspectWorkflow(workflow);
                      }}
                      style={{
                        height: 28,
                        padding: '0 10px',
                        fontSize: 11.5,
                        gap: 4,
                      }}
                    >
                      Inspect
                      <ArrowRight size={12} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Bounded Pagination & Footer Bar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          borderTop: '1px solid var(--border)',
          backgroundColor: 'var(--bg-surface)',
          fontSize: 12.5,
          color: 'var(--text-soft)',
        }}
      >
        <span>
          Showing {filtered.length === 0 ? 0 : (pageIndex - 1) * PAGE_SIZE + 1}–
          {Math.min(pageIndex * PAGE_SIZE, filtered.length)} of {filtered.length} transactions
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            Page {pageIndex} of {totalPages}
          </span>
          <button
            className="ds-btn ds-btn-ghost ds-btn-icon"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={pageIndex <= 1}
            style={{ width: 28, height: 28, borderRadius: 6 }}
            aria-label="Previous Page"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            className="ds-btn ds-btn-ghost ds-btn-icon"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={pageIndex >= totalPages}
            style={{ width: 28, height: 28, borderRadius: 6 }}
            aria-label="Next Page"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default WorkflowTable;
