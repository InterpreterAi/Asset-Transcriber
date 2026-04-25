import { useState, useEffect, useCallback } from "react";
import { X, LifeBuoy, Send, Clock, CheckCircle, ChevronRight, ChevronDown, RefreshCw, MessageCircle, CornerDownRight } from "lucide-react";
import { Button, Input } from "@/components/ui-components";
import { format } from "date-fns";

interface SupportTicket {
  id:        number;
  email:     string;
  subject:   string;
  message:   string;
  status:    string;
  createdAt: string;
  updatedAt: string;
}

interface SupportReply {
  id:        number;
  isAdmin:   boolean;
  message:   string;
  createdAt: string;
  username:  string | null;
}

interface TicketDetail extends SupportTicket {
  replies: SupportReply[];
}

interface SupportPanelProps {
  userEmail?: string | null;
  onClose: () => void;
}

function StatusBadge({ status }: { status: string }) {
  return status === "resolved" ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-full">
      <CheckCircle className="w-2.5 h-2.5" /> Resolved
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full">
      <Clock className="w-2.5 h-2.5" /> Open
    </span>
  );
}

export function SupportPanel({ userEmail, onClose }: SupportPanelProps) {
  const [tab, setTab] = useState<"new" | "my">("new");

  // ── New Request form ────────────────────────────────────────────────────────
  const [email,   setEmail]   = useState(userEmail ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState<{ id: number } | null>(null);
  const [formError,  setFormError]  = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!email.trim() || !subject.trim() || !message.trim()) {
      setFormError("All fields are required."); return;
    }
    if (message.trim().length < 10) {
      setFormError("Message must be at least 10 characters."); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/support", {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify({ email: email.trim(), subject: subject.trim(), message: message.trim() }),
      });
      const data = await res.json() as { ticket?: { id: number }; error?: string };
      if (!res.ok) { setFormError(data.error ?? "Submission failed."); return; }
      setSubmitted({ id: data.ticket!.id });
      setSubject(""); setMessage("");
      // Refresh My Requests
      void fetchMyTickets();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── My Requests ─────────────────────────────────────────────────────────────
  const [tickets, setTickets]           = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [expandedId, setExpandedId]     = useState<number | null>(null);
  const [ticketDetail, setTicketDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText]       = useState("");
  const [replying, setReplying]         = useState(false);
  const [replyError, setReplyError]     = useState<string | null>(null);

  const fetchMyTickets = useCallback(async () => {
    setTicketsLoading(true);
    try {
      const res  = await fetch("/api/support", { credentials: "include" });
      const data = await res.json() as { tickets: SupportTicket[] };
      setTickets(data.tickets ?? []);
    } catch { setTickets([]); }
    setTicketsLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "my") void fetchMyTickets();
  }, [tab, fetchMyTickets]);

  const toggleTicket = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); setTicketDetail(null); setReplyText(""); setReplyError(null); return; }
    setExpandedId(id);
    setDetailLoading(true);
    setReplyText(""); setReplyError(null);
    try {
      const res  = await fetch(`/api/support/${id}`, { credentials: "include" });
      const data = await res.json() as { ticket: SupportTicket; replies: SupportReply[] };
      setTicketDetail({ ...data.ticket, replies: data.replies });
    } catch { setTicketDetail(null); }
    setDetailLoading(false);
  };

  const submitUserReply = async (ticketId: number) => {
    if (!replyText.trim() || replying) return;
    setReplying(true); setReplyError(null);
    try {
      const res  = await fetch(`/api/support/${ticketId}/reply`, {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify({ message: replyText.trim() }),
      });
      const data = await res.json() as { reply?: SupportReply; reopened?: boolean; error?: string };
      if (!res.ok) { setReplyError(data.error ?? "Failed to send reply."); return; }
      // Append the new reply locally
      if (data.reply) {
        setTicketDetail(d => d ? { ...d, replies: [...d.replies, data.reply!], status: "open" } : d);
      }
      // Update ticket status in list if it was reopened
      if (data.reopened) {
        setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: "open" } : t));
      }
      setReplyText("");
    } catch {
      setReplyError("Network error. Please try again.");
    } finally {
      setReplying(false);
    }
  };

  const openCount = tickets.filter(t => t.status === "open").length;

  return (
    <div className="w-full md:w-80 bg-card border-r border-border dark:border-white/[0.08] flex flex-col overflow-hidden shrink-0 z-10 shadow-[inset_-1px_0_0_rgba(255,255,255,0.04)]">
      {/* Header */}
      <div className="h-[52px] border-b border-border dark:border-white/[0.08] flex items-center justify-between px-4 shrink-0 bg-muted/10 dark:bg-black/20">
        <div className="flex items-center gap-2">
          <LifeBuoy className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">Support</span>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border dark:border-white/[0.08] shrink-0">
        <button
          onClick={() => setTab("new")}
          className={`flex-1 py-2.5 text-xs font-semibold transition-all ${tab === "new" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          New Request
        </button>
        <button
          onClick={() => setTab("my")}
          className={`flex-1 py-2.5 text-xs font-semibold transition-all ${tab === "my" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          My Requests{tickets.length > 0 && ` (${tickets.length})`}
          {openCount > 0 && <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold bg-primary text-white rounded-full">{openCount}</span>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── NEW REQUEST ───────────────────────────────────────────────────── */}
        {tab === "new" && (
          <div className="p-4 space-y-4">
            {submitted ? (
              <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Request submitted!</p>
                  <p className="text-xs text-muted-foreground mt-1">Ticket #{submitted.id} created. We'll reply by email.</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setSubmitted(null); setTab("my"); }} className="mt-2 text-xs">
                  View My Requests
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Have a question or issue? Fill out the form below and we'll get back to you.
                </p>

                {formError && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    {formError}
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Email</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Subject</label>
                  <Input
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="Brief summary of your issue"
                    required
                    maxLength={150}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Message</label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Describe your issue in detail..."
                    required
                    rows={5}
                    className="w-full text-sm rounded-xl border border-border dark:border-white/10 bg-background dark:bg-muted/30 px-3 py-2.5 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none transition-all"
                  />
                  <p className="text-[10px] text-muted-foreground text-right">{message.length}/1000</p>
                </div>

                <Button type="submit" isLoading={submitting} className="w-full text-sm h-9">
                  <Send className="w-3.5 h-3.5 mr-1.5" /> Send Request
                </Button>
              </form>
            )}
          </div>
        )}

        {/* ── MY REQUESTS ──────────────────────────────────────────────────── */}
        {tab === "my" && (
          <div>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
              <p className="text-xs text-muted-foreground">{tickets.length} ticket{tickets.length !== 1 ? "s" : ""}</p>
              <button onClick={fetchMyTickets} className="text-muted-foreground hover:text-foreground transition-colors" title="Refresh">
                <RefreshCw className={`w-3.5 h-3.5 ${ticketsLoading ? "animate-spin" : ""}`} />
              </button>
            </div>

            {ticketsLoading && tickets.length === 0 ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-primary" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <MessageCircle className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No requests yet.</p>
                <button onClick={() => setTab("new")} className="mt-2 text-xs text-primary hover:underline">Submit your first request</button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {tickets.map(ticket => (
                  <div key={ticket.id}>
                    {/* Ticket row */}
                    <button
                      className="w-full px-4 py-3 text-left hover:bg-muted/40 dark:hover:bg-white/[0.05] transition-colors flex items-start gap-2"
                      onClick={() => toggleTicket(ticket.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] text-muted-foreground font-mono">#{ticket.id}</span>
                          <StatusBadge status={ticket.status} />
                        </div>
                        <p className="text-sm font-medium text-foreground truncate">{ticket.subject}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {format(new Date(ticket.createdAt), "MMM d, yyyy 'at' HH:mm")}
                        </p>
                      </div>
                      {expandedId === ticket.id
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                        : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />}
                    </button>

                    {/* Expanded thread */}
                    {expandedId === ticket.id && (
                      <div className="bg-muted/30 dark:bg-black/25 border-t border-border dark:border-white/[0.06]">
                        {detailLoading ? (
                          <div className="flex justify-center py-6">
                            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-primary" />
                          </div>
                        ) : ticketDetail && (
                          <div className="px-4 py-3 space-y-3">
                            {/* Original message */}
                            <div className="bg-white rounded-xl border border-border p-3">
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Your message</p>
                              <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{ticketDetail.message}</p>
                            </div>

                            {/* Replies */}
                            {ticketDetail.replies.length > 0 ? (
                              ticketDetail.replies.map(reply => (
                                <div key={reply.id} className={`rounded-xl border p-3 ${reply.isAdmin ? "bg-blue-50 border-blue-100" : "bg-white border-border"}`}>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                    {reply.isAdmin ? <><span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />Support Team</> : "You"}
                                    <span className="ml-auto normal-case font-normal">{format(new Date(reply.createdAt), "MMM d, HH:mm")}</span>
                                  </p>
                                  <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{reply.message}</p>
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-muted-foreground text-center py-2">No replies yet. We'll be in touch soon.</p>
                            )}

                            {/* User reply box */}
                            <div className="border-t border-border/50 pt-3 mt-1">
                              {ticketDetail.status === "resolved" && (
                                <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mb-2 flex items-center gap-1">
                                  <span className="font-semibold">Resolved</span> — replying will reopen this ticket
                                </p>
                              )}
                              {replyError && (
                                <p className="text-[10px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5 mb-2">{replyError}</p>
                              )}
                              <textarea
                                value={replyText}
                                onChange={e => setReplyText(e.target.value)}
                                placeholder="Write a follow-up message..."
                                rows={3}
                                className="w-full text-xs rounded-xl border border-border bg-white px-3 py-2.5 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none transition-all"
                              />
                              <Button
                                size="sm"
                                className="w-full mt-2 text-xs h-8"
                                isLoading={replying}
                                disabled={!replyText.trim()}
                                onClick={() => submitUserReply(ticket.id)}
                              >
                                <CornerDownRight className="w-3 h-3 mr-1.5" /> Send Reply
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
