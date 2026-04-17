import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  MessageCircle, Send, Search, Plus, Tag, User, Link2, StickyNote, CheckCheck, Check,
  X, Clock, AlertCircle, Phone, UserPlus, ChevronRight, Inbox as InboxIcon, Filter
} from "lucide-react";
import type { WhatsappConversation, WhatsappMessage, WhatsappTemplate } from "@shared/schema";

type EnrichedConversation = WhatsappConversation & { customerName?: string | null; leadName?: string | null };

const TAG_OPTIONS = ["Hot", "Negotiation", "Closed Won", "Lost", "Follow-up"];
const TAG_COLORS: Record<string, string> = {
  "Hot": "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  "Negotiation": "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  "Closed Won": "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400",
  "Lost": "bg-gray-100 text-gray-700 dark:bg-gray-950/40 dark:text-gray-400",
  "Follow-up": "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
};

function MessageTick({ status }: { status: string }) {
  if (status === "failed") return <AlertCircle className="w-3 h-3 text-red-500" />;
  if (status === "read") return <CheckCheck className="w-3 h-3 text-blue-500" />;
  if (status === "delivered") return <CheckCheck className="w-3 h-3 text-muted-foreground" />;
  if (status === "sent") return <Check className="w-3 h-3 text-muted-foreground" />;
  return null;
}

function timeAgo(dateStr: string | Date) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function formatTime(dateStr: string | Date) {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Inbox() {
  const { toast } = useToast();
  const { data: currentUser } = useCurrentUser();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [createLeadOpen, setCreateLeadOpen] = useState(false);
  const [newLeadName, setNewLeadName] = useState("");
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsappTemplate | null>(null);
  const [templateVars, setTemplateVars] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [], isLoading: convsLoading } = useQuery<EnrichedConversation[]>({
    queryKey: ["/api/whatsapp/conversations"],
    refetchInterval: 10000,
  });

  const { data: messages = [] } = useQuery<WhatsappMessage[]>({
    queryKey: ["/api/whatsapp/conversations", selectedConvId, "messages"],
    queryFn: () => fetch(`/api/whatsapp/conversations/${selectedConvId}/messages`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    }).then(r => r.json()),
    enabled: !!selectedConvId,
    refetchInterval: () => document.visibilityState === "visible" ? 10000 : false,
  });

  const { data: templates = [] } = useQuery<WhatsappTemplate[]>({
    queryKey: ["/api/whatsapp/templates"],
  });

  const selectedConv = conversations.find(c => c.id === selectedConvId);

  // Mark conversation as read when selected
  const handleSelectConversation = useCallback(async (convId: string) => {
    setSelectedConvId(convId);
    const conv = conversations.find(c => c.id === convId);
    if (conv && (conv.unreadCount || 0) > 0) {
      try {
        await apiRequest("PATCH", `/api/whatsapp/conversations/${convId}`, { unreadCount: 0 });
        queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/conversations"] });
      } catch {
        // non-critical
      }
    }
  }, [conversations]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", `/api/whatsapp/conversations/${selectedConvId}/send`, payload);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/conversations", selectedConvId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/conversations"] });
      setMessageText("");
    },
    onError: (e: Error) => toast({ title: "Failed to send", description: e.message, variant: "destructive" }),
  });

  const noteMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await apiRequest("POST", `/api/whatsapp/conversations/${selectedConvId}/note`, { body });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/conversations", selectedConvId, "messages"] });
      setNoteText(""); setShowNote(false);
    },
    onError: (e: Error) => toast({ title: "Failed to add note", description: e.message, variant: "destructive" }),
  });

  const patchConvMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/whatsapp/conversations/${selectedConvId}`, data);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/conversations"] }),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const newConvMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/whatsapp/conversations", { phone: newPhone, contactName: newName || undefined });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: (conv: WhatsappConversation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/conversations"] });
      setSelectedConvId(conv.id);
      setNewConvOpen(false); setNewPhone(""); setNewName("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createLeadMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/whatsapp/conversations/${selectedConvId}/create-lead`, { name: newLeadName });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/conversations"] });
      setCreateLeadOpen(false); setNewLeadName("");
      toast({ title: "Lead created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sendTemplate = useCallback(() => {
    if (!selectedTemplate) return;
    sendMutation.mutate({
      messageType: "template",
      templateName: selectedTemplate.templateId,
      templateVariables: templateVars,
    });
    setTemplateDialogOpen(false);
    setSelectedTemplate(null);
    setTemplateVars([]);
  }, [selectedTemplate, templateVars, sendMutation]);

  const filtered = conversations.filter(c => {
    const name = c.contactName || c.customerName || c.leadName || c.phone;
    const matchSearch = !search || name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const windowOpen = selectedConv?.windowExpiresAt
    ? new Date(selectedConv.windowExpiresAt) > new Date()
    : false;

  const displayName = (c: EnrichedConversation) => c.contactName || c.customerName || c.leadName || c.phone;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel: Conversation list */}
      <div className="w-80 flex-shrink-0 border-r flex flex-col">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <InboxIcon className="w-4 h-4" />
              WhatsApp Inbox
            </h2>
            <Button size="sm" onClick={() => setNewConvOpen(true)} data-testid="button-new-conversation">
              <Plus className="w-3.5 h-3.5 mr-1" /> New
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-xs"
              placeholder="Search conversations..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-conv-search"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-status-filter">
              <Filter className="w-3 h-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 overflow-y-auto">
          {convsLoading ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center space-y-2">
              <MessageCircle className="w-8 h-8 mx-auto opacity-30" />
              <p>No conversations yet</p>
            </div>
          ) : (
            filtered.map(conv => (
              <div
                key={conv.id}
                className={`flex items-start gap-3 px-3 py-3 cursor-pointer border-b transition-colors ${selectedConvId === conv.id ? "bg-blue-50 dark:bg-blue-950/20" : "hover:bg-muted/50"}`}
                onClick={() => handleSelectConversation(conv.id)}
                data-testid={`conversation-${conv.id}`}
              >
                <Avatar className="w-9 h-9 shrink-0">
                  <AvatarFallback className="text-xs bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400">
                    {displayName(conv).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-sm truncate ${(conv.unreadCount || 0) > 0 ? "font-bold" : "font-medium"}`}>{displayName(conv)}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {(conv.unreadCount || 0) > 0 && (
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-500 text-white text-[9px] font-bold" data-testid={`badge-unread-${conv.id}`}>{conv.unreadCount}</span>
                      )}
                      <span className="text-[10px] text-muted-foreground">{timeAgo(conv.lastMessageAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Phone className="w-2.5 h-2.5 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">{conv.phone}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {conv.status === "closed" && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 no-default-hover-elevate no-default-active-elevate">Closed</Badge>
                    )}
                    {conv.tag && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TAG_COLORS[conv.tag] || "bg-muted text-muted-foreground"}`}>
                        {conv.tag}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Middle panel: Message thread */}
      <div className="flex-1 flex flex-col min-w-0 border-r">
        {!selectedConv ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <MessageCircle className="w-12 h-12 opacity-20" />
            <p className="text-sm">Select a conversation to start</p>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="text-xs bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400">
                  {displayName(selectedConv).charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{displayName(selectedConv)}</p>
                <p className="text-xs text-muted-foreground">{selectedConv.phone}</p>
              </div>
              {selectedConv.status === "open" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => patchConvMutation.mutate({ status: "closed" })}
                  data-testid="button-close-conversation"
                >
                  Close
                </Button>
              )}
              {selectedConv.status === "closed" && (
                <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate">Closed</Badge>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.map(msg => {
                const isOutbound = msg.direction === "outbound";
                const isNote = msg.isNote;
                if (isNote) {
                  return (
                    <div key={msg.id} className="flex justify-center" data-testid={`msg-note-${msg.id}`}>
                      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-1.5 max-w-[80%] text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                        <StickyNote className="w-3 h-3 shrink-0 mt-0.5" />
                        <span>{msg.body}</span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={msg.id} className={`flex ${isOutbound ? "justify-end" : "justify-start"}`} data-testid={`msg-${msg.id}`}>
                    <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                      isOutbound
                        ? "bg-green-600 text-white rounded-br-sm"
                        : "bg-muted rounded-bl-sm"
                    }`}>
                      {msg.messageType === "template" && (
                        <div className="text-[10px] opacity-70 mb-1 flex items-center gap-1">
                          <Tag className="w-2.5 h-2.5" /> Template
                        </div>
                      )}
                      <p className="break-words leading-relaxed">{msg.body || "[media]"}</p>
                      <div className={`flex items-center gap-1 mt-1 justify-end ${isOutbound ? "opacity-80" : "opacity-60"}`}>
                        <span className="text-[10px]">{formatTime(msg.createdAt)}</span>
                        {isOutbound && <MessageTick status={msg.status} />}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose area */}
            {selectedConv.status === "closed" ? (
              <div className="px-4 py-3 border-t text-center text-xs text-muted-foreground">
                This conversation is closed. Closed conversations cannot be reopened.
              </div>
            ) : !windowOpen ? (
              <div className="px-4 py-3 border-t space-y-2">
                <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-md">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  24-hour window closed. You can only send approved templates.
                </div>
                <Button
                  variant="outline"
                  className="w-full text-xs"
                  onClick={() => setTemplateDialogOpen(true)}
                  data-testid="button-send-template"
                >
                  <Tag className="w-3.5 h-3.5 mr-2" /> Send Template Message
                </Button>
              </div>
            ) : (
              <div className="px-4 py-3 border-t space-y-2">
                {showNote ? (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Add internal note (not sent to customer)..."
                      className="text-sm min-h-[80px] resize-none"
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      data-testid="textarea-note"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => noteMutation.mutate(noteText)} disabled={!noteText || noteMutation.isPending} data-testid="button-submit-note">
                        Save Note
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowNote(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Type a message..."
                      className="text-sm min-h-[60px] resize-none flex-1"
                      value={messageText}
                      onChange={e => setMessageText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (messageText.trim()) sendMutation.mutate({ body: messageText });
                        }
                      }}
                      data-testid="textarea-message"
                    />
                    <div className="flex flex-col gap-1">
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={!messageText.trim() || sendMutation.isPending}
                        onClick={() => sendMutation.mutate({ body: messageText })}
                        data-testid="button-send-message"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setTemplateDialogOpen(true)} title="Send Template" data-testid="button-template">
                        <Tag className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowNote(true)} title="Add Note" data-testid="button-note">
                        <StickyNote className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Right panel: Contact info */}
      {selectedConv && (
        <div className="w-72 flex-shrink-0 flex flex-col overflow-y-auto p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <User className="w-4 h-4" /> Contact Info
            </h3>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="font-medium">{displayName(selectedConv)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p className="font-medium flex items-center gap-1">
                  <Phone className="w-3 h-3" /> +{selectedConv.phone}
                </p>
              </div>
              {selectedConv.customerName && (
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1">
                    <Link2 className="w-3 h-3" /> {selectedConv.customerName}
                  </p>
                </div>
              )}
              {selectedConv.leadName && (
                <div>
                  <p className="text-xs text-muted-foreground">Lead</p>
                  <p className="font-medium text-purple-600 dark:text-purple-400 flex items-center gap-1">
                    <Link2 className="w-3 h-3" /> {selectedConv.leadName}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Create Lead button for unknown contacts */}
          {!selectedConv.leadId && !selectedConv.customerId && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => { setNewLeadName(selectedConv.contactName || ""); setCreateLeadOpen(true); }}
              data-testid="button-create-lead"
            >
              <UserPlus className="w-3.5 h-3.5 mr-2" /> Create Lead
            </Button>
          )}

          {/* Tag */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">Tag</p>
            <Select
              value={selectedConv.tag || "none"}
              onValueChange={v => patchConvMutation.mutate({ tag: v === "none" ? null : v })}
            >
              <SelectTrigger className="h-8 text-xs" data-testid="select-tag">
                <SelectValue placeholder="No tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No tag</SelectItem>
                {TAG_OPTIONS.map(t => (
                  <SelectItem key={t} value={t}>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${TAG_COLORS[t]}`}>{t}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Window status */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">24h Window</p>
            <div className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-md ${windowOpen ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
              <Clock className="w-3.5 h-3.5" />
              {windowOpen
                ? `Closes ${new Date(selectedConv.windowExpiresAt!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Closed — template only"}
            </div>
          </div>
        </div>
      )}

      {/* New Conversation Dialog */}
      <Dialog open={newConvOpen} onOpenChange={setNewConvOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Conversation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Phone Number *</Label>
              <Input
                placeholder="+91 98765 43210"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                data-testid="input-new-phone"
              />
              <p className="text-xs text-muted-foreground">Enter with or without country code</p>
            </div>
            <div className="space-y-1.5">
              <Label>Contact Name (optional)</Label>
              <Input
                placeholder="Customer / Lead name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                data-testid="input-new-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewConvOpen(false)}>Cancel</Button>
            <Button
              disabled={!newPhone.trim() || newConvMutation.isPending}
              onClick={() => newConvMutation.mutate()}
              data-testid="button-create-conversation"
            >
              {newConvMutation.isPending ? "Creating..." : "Start Conversation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Lead Dialog */}
      <Dialog open={createLeadOpen} onOpenChange={setCreateLeadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Lead from Conversation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Lead Name *</Label>
              <Input
                value={newLeadName}
                onChange={e => setNewLeadName(e.target.value)}
                placeholder="Contact's name"
                data-testid="input-lead-name"
              />
            </div>
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
              Phone: <strong>{selectedConv?.phone}</strong> will be linked to this lead automatically.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateLeadOpen(false)}>Cancel</Button>
            <Button
              disabled={!newLeadName.trim() || createLeadMutation.isPending}
              onClick={() => createLeadMutation.mutate()}
              data-testid="button-confirm-create-lead"
            >
              {createLeadMutation.isPending ? "Creating..." : "Create Lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send Template Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No approved templates found. Add templates in the Templates Manager.</p>
            ) : (
              <div className="space-y-2">
                {templates.filter(t => t.status === "approved").map(t => (
                  <div
                    key={t.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedTemplate?.id === t.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" : "hover:bg-muted/50"}`}
                    onClick={() => {
                      setSelectedTemplate(t);
                      setTemplateVars(new Array(t.variables?.length || 0).fill(""));
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium">{t.name}</p>
                      <Badge variant="outline" className="text-[10px] no-default-hover-elevate no-default-active-elevate">{t.category}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{t.body}</p>
                  </div>
                ))}
              </div>
            )}
            {selectedTemplate && selectedTemplate.variables && selectedTemplate.variables.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-semibold text-muted-foreground">Fill in variables</p>
                {selectedTemplate.variables.map((varName, i) => (
                  <div key={i} className="space-y-1">
                    <Label className="text-xs">{varName || `Variable ${i + 1}`}</Label>
                    <Input
                      className="h-8 text-xs"
                      value={templateVars[i] || ""}
                      onChange={e => {
                        const updated = [...templateVars];
                        updated[i] = e.target.value;
                        setTemplateVars(updated);
                      }}
                      data-testid={`input-template-var-${i}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!selectedTemplate || sendMutation.isPending}
              onClick={sendTemplate}
              data-testid="button-send-template-confirm"
            >
              Send Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
