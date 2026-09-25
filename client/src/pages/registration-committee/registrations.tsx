import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Copy, CheckCircle, Search, Filter, X, Users, AlertCircle, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import RegistrationCommitteeLayout from "@/components/layouts/RegistrationCommitteeLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Registration, Event, TeamMember } from "@shared/schema";

interface RegistrationWithDetails extends Registration {
  event?: Event;
  teamMembers?: TeamMember[];
}



export default function RegistrationCommitteeRegistrationsPage() {
  const { toast } = useToast();

  // New state for the confirmation dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    participant: any; // Using the grouped participant type structure
    pendingIds: string[];
  }>({
    isOpen: false,
    participant: null,
    pendingIds: []
  });

  const [showCredentials, setShowCredentials] = useState(false);
  const [credentials, setCredentials] = useState<{
    eventCredentials: Array<{ eventId: string; eventName: string; eventUsername: string; eventPassword: string; teamId?: string }>;
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterEvent, setFilterEvent] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCollege, setFilterCollege] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<string>("none");

  const { data: registrations, isLoading } = useQuery<RegistrationWithDetails[]>({
    queryKey: ['/api/registrations'],
  });

  const { data: events } = useQuery<Event[]>({
    queryKey: ['/api/events'],
  });

  const { data: colleges } = useQuery<string[]>({
    queryKey: ['/api/registrations/colleges'],
  });

  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const handleExportCsv = useCallback(() => {
    if (!registrations || registrations.length === 0) return;

    const headers = [
      'Team ID',
      'Participant Name',
      'Roll No',
      'Email',
      'Phone',
      'Department',
      'College',
      'Event',
    ];

    const rows: Array<{ college: string; data: string }> = [];

    registrations.forEach((reg) => {
      const base = {
        teamId: reg.teamId || reg.id,
        eventName: reg.event?.name || reg.eventId,
        college: reg.organizerCollege || '',
      };

      // Leader row
      rows.push({
        college: base.college,
        data: [
          base.teamId,
          reg.organizerName,
          reg.organizerRollNo,
          reg.organizerEmail,
          reg.organizerPhone,
          reg.organizerDept,
          base.college,
          base.eventName,
        ].map(escapeCsv).join(',')
      });

      // Team member rows
      if (reg.teamMembers?.length) {
        reg.teamMembers.forEach((tm) => {
          rows.push({
            college: base.college,
            data: [
              base.teamId,
              tm.memberName,
              tm.memberRollNo,
              tm.memberEmail,
              tm.memberPhone,
              tm.memberDept,
              base.college,
              base.eventName,
            ].map(escapeCsv).join(',')
          });
        });
      }
    });

    // Sort by college name for grouping
    rows.sort((a, b) => a.college.localeCompare(b.college));

    const csv = [headers.join(','), ...rows.map(r => r.data)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'registrations-export.csv';
    link.click();
    URL.revokeObjectURL(url);
  }, [registrations]);

  // Single confirm mutation (used internally by bulk generally now, or for single specific actions)
  const confirmMutation = useMutation({
    mutationFn: async (registrationId: string) => {
      const response = await apiRequest('PATCH', `/api/registrations/${registrationId}/confirm`);
      const result = await response.json();
      return result;
    },
    onSuccess: (data) => {
      if (data.eventCredentials) {
        setCredentials({ eventCredentials: data.eventCredentials });
        setShowCredentials(true);
      }
      setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      queryClient.invalidateQueries({ queryKey: ['/api/registrations'] });
      toast({
        title: "Success",
        description: "Registration confirmed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Bulk confirm mutation
  const bulkConfirmMutation = useMutation({
    mutationFn: async (registrationIds: string[]) => {
      const response = await apiRequest('POST', `/api/registrations/bulk-confirm`, { registrationIds });
      return response.json();
    },
    onSuccess: (data) => {
      setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      queryClient.invalidateQueries({ queryKey: ['/api/registrations'] });
      // Show credentials if returned (bulk confirm might return a list of results)
      // The API returns { confirmed: number, message: string, results: [...] }
      // We might want to aggregate credentials from results if needed, 
      // but usually bulk confirm emails them. 
      // For now, simple success message is okay, or specialized credential display if critical.
      toast({
        title: "Success",
        description: data.message || `Confirmed ${data.confirmed} registration(s)`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getEventName = (eventId: string) => {
    const event = events?.find(e => e.id === eventId);
    return event?.name || eventId;
  };

  // 1. Group by Unique Participant (using Roll No)
  const groupedUniqueParticipants = useMemo(() => {
    if (!registrations) return [];

    const uniqueParticipantsMap = new Map<string, {
      id: string; // generated ID
      name: string;
      email: string;
      rollNo: string;
      dept: string;
      college: string;
      phone: string;
      registrations: Array<{
        id: string; // registration ID
        teamId: string | null;
        eventName: string;
        eventId: string;
        role: 'Leader' | 'Member';
        status: string;
        registrationType: string;
        createdAt: Date;
        originalRegistration: RegistrationWithDetails;
      }>
    }>();

    registrations.forEach(reg => {
      // Process Organizer
      const organizerKey = reg.organizerRollNo || reg.organizerEmail;
      if (!uniqueParticipantsMap.has(organizerKey)) {
        uniqueParticipantsMap.set(organizerKey, {
          id: `p-${organizerKey}`,
          name: reg.organizerName,
          email: reg.organizerEmail,
          rollNo: reg.organizerRollNo,
          dept: reg.organizerDept,
          college: reg.organizerCollege || '',
          phone: reg.organizerPhone || '',
          registrations: []
        });

      }
      uniqueParticipantsMap.get(organizerKey)!.registrations.push({
        id: reg.id,
        teamId: reg.teamId,
        eventName: reg.event?.name || getEventName(reg.eventId),
        eventId: reg.eventId,
        role: 'Leader',
        status: reg.status,
        registrationType: reg.registrationType,
        createdAt: new Date(reg.createdAt),
        originalRegistration: reg
      });

      // Process Team Members (for display context, they appear in their own rows if they are organizers, 
      // but here we are listing "Participants" as rows. 
      // If a team member is JUST a member, they don't get a row? 
      // The logic below adds them as separate entries if they are team members 
      // so they can see their status. 
      // BUT for "Approval", we usually approve the TEAM (Leader's registration).
      // So approval actions should be on the Leader's row.
      if (reg.teamMembers && reg.teamMembers.length > 0) {
        reg.teamMembers.forEach(member => {
          const memberKey = member.memberRollNo || member.memberEmail;
          if (!uniqueParticipantsMap.has(memberKey)) {
            uniqueParticipantsMap.set(memberKey, {
              id: `p-${memberKey}`,
              name: member.memberName,
              email: member.memberEmail,
              rollNo: member.memberRollNo,
              dept: member.memberDept,
              college: reg.organizerCollege || '',
              phone: member.memberPhone || '',
              registrations: []
            });
          }
          uniqueParticipantsMap.get(memberKey)!.registrations.push({
            id: reg.id,
            teamId: reg.teamId,
            eventName: reg.event?.name || getEventName(reg.eventId),
            eventId: reg.eventId,
            role: 'Member',
            status: reg.status,
            registrationType: reg.registrationType,
            createdAt: new Date(member.addedAt || reg.createdAt),
            originalRegistration: reg
          });
        });
      }
    });

    return Array.from(uniqueParticipantsMap.values());
  }, [registrations, events]);

  // 2. Filter
  const filteredParticipants = useMemo(() => {
    return groupedUniqueParticipants.filter(p => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery ||
        p.name.toLowerCase().includes(searchLower) ||
        p.email.toLowerCase().includes(searchLower) ||
        p.rollNo.toLowerCase().includes(searchLower) ||
        p.dept.toLowerCase().includes(searchLower);

      const matchesEvent = filterEvent === "all" || p.registrations.some(r => r.eventId === filterEvent);
      const matchesStatus = filterStatus === "all" || p.registrations.some(r => r.status === filterStatus);
      const matchesCollege = filterCollege === "all" || p.college === filterCollege;

      return matchesSearch && matchesEvent && matchesStatus && matchesCollege;
    });
  }, [groupedUniqueParticipants, searchQuery, filterEvent, filterStatus, filterCollege]);

  // 3. Grouping for display
  const displayedGroups = useMemo(() => {
    if (groupBy === "none" || groupBy === "event" || groupBy === "status") {
      return { "All Participants": filteredParticipants };
    }

    const groups: Record<string, typeof filteredParticipants> = {};

    filteredParticipants.forEach(p => {
      let groupKey = "Other";
      if (groupBy === "dept") groupKey = p.dept || "Unknown";
      else if (groupBy === "college") groupKey = p.college || "Unknown";

      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(p);
    });

    return groups;
  }, [filteredParticipants, groupBy]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'default';
      case 'pending': return 'secondary';
      case 'cancelled': return 'destructive';
      default: return 'outline';
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setFilterEvent("all");
    setFilterStatus("all");
    setFilterCollege("all");
    setGroupBy("none");
  };

  const copyCredentials = () => {
    if (credentials) {
      let text = `Event Credentials:\n`;
      credentials.eventCredentials.forEach((event) => {
        text += `\n${event.eventName}:\nTeam ID: ${event.teamId || 'â€”'}\nUsername: ${event.eventUsername}\nPassword: ${event.eventPassword}\n`;
      });
      navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Credentials copied to clipboard" });
    }
  };

  const hasActiveFilters = searchQuery || filterEvent !== "all" || filterStatus !== "all" || filterCollege !== "all" || groupBy !== "none";

  const handleConfirmClick = (participant: any, pendingIds: string[]) => {
    setConfirmDialog({
      isOpen: true,
      participant,
      pendingIds
    });
  };

  const handleConfirmAction = () => {
    const { pendingIds } = confirmDialog;
    if (pendingIds.length === 1) {
      confirmMutation.mutate(pendingIds[0]);
    } else {
      bulkConfirmMutation.mutate(pendingIds);
    }
  };

  return (
    <RegistrationCommitteeLayout>
      <div className="container mx-auto p-4 md:p-6 max-w-7xl" data-testid="page-reg-committee-registrations">
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold" data-testid="heading-registrations">Registrations</h1>
            <p className="text-muted-foreground">Review and confirm participant registrations</p>
          </div>
          <Button variant="outline" onClick={handleExportCsv} disabled={!registrations || registrations.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Search & Filter
                </CardTitle>
                <CardDescription>Find participants by name, roll number, or event</CardDescription>
              </div>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                  <X className="h-4 w-4 mr-1" />
                  Clear Filters
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, roll number, email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-search"
                  />
                </div>
              </div>

              <Select value={filterEvent} onValueChange={setFilterEvent}>
                <SelectTrigger data-testid="select-event-filter">
                  <SelectValue placeholder="Filter by Event" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  {events?.map(event => (
                    <SelectItem key={event.id} value={event.id}>{event.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger data-testid="select-status-filter">
                  <SelectValue placeholder="Filter by Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="mt-4">
              <Select value={filterCollege} onValueChange={setFilterCollege}>
                <SelectTrigger data-testid="select-college-filter">
                  <SelectValue placeholder="Filter by College" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Colleges</SelectItem>
                  {colleges?.map(college => (
                    <SelectItem key={college} value={college}>{college}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Group by:</span>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={groupBy === "none" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setGroupBy("none")}
                  data-testid="button-group-none"
                >
                  None
                </Button>
                <Button
                  variant={groupBy === "dept" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setGroupBy("dept")}
                  data-testid="button-group-dept"
                >
                  Department
                </Button>
                <Button
                  variant={groupBy === "college" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setGroupBy("college")}
                  data-testid="button-group-college"
                >
                  College
                </Button>
              </div>
              <span className="ml-auto text-sm text-muted-foreground">
                Showing {filteredParticipants.length} participants
              </span>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div data-testid="loading-registrations">Loading registrations...</div>
        ) : Object.entries(displayedGroups).map(([groupName, groupParticipants]) => (
          <Card key={groupName} className="mb-4">
            <CardHeader>
              <CardTitle>{groupName}</CardTitle>
              <CardDescription>{groupParticipants.length} participant(s)</CardDescription>
            </CardHeader>
            <CardContent>
              {groupParticipants.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table data-testid={`table-registrations-${groupName}`}>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Participant</TableHead>
                        <TableHead>Roll No</TableHead>
                        <TableHead>Dept</TableHead>
                        <TableHead>College</TableHead>
                        <TableHead>Event(s)</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupParticipants.map((p) => (
                        <TableRow key={p.id} data-testid={`row-participant-${p.id}`}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{p.name}</p>
                              <p className="text-sm text-muted-foreground">{p.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <code className="text-sm">{p.rollNo}</code>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{p.dept}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {p.college || '-'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-2">
                              {p.registrations.map(reg => (
                                <div key={reg.id + reg.eventId} className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline">{reg.eventName}</Badge>
                                  <Badge variant="secondary" className="text-[11px] font-mono">{reg.teamId}</Badge>
                                  <span className="text-xs text-muted-foreground">({reg.role})</span>
                                  <Badge variant={getStatusColor(reg.status)} className="text-xs h-5 px-1.5">{reg.status}</Badge>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const pendingRegs = p.registrations.filter(r => r.status === 'pending' && r.role === 'Leader');
                              const pendingIds = Array.from(new Set(pendingRegs.map(r => r.id)));
                              if (pendingIds.length === 0) return null;
                              return (
                                <Button
                                  size="sm"
                                  className="h-8"
                                  onClick={() => handleConfirmClick(p, pendingIds)}
                                  disabled={confirmMutation.isPending || bulkConfirmMutation.isPending}
                                  data-testid={`button-confirm-all-${p.id}`}
                                >
                                  {pendingIds.length === 1 ? 'Confirm' : `Confirm All (${pendingIds.length})`}
                                </Button>
                              );
                            })()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground" data-testid="text-no-registrations">
                  No participants match your filters
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {!isLoading && (!registrations || registrations.length === 0) && (
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-muted-foreground" data-testid="text-no-registrations">
                No registrations yet
              </div>
            </CardContent>
          </Card>
        )}

        {/* Detailed Confirmation Dialog */}
        <Dialog open={confirmDialog.isOpen} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, isOpen: open }))}>
          <DialogContent className="max-w-2xl" data-testid="dialog-confirm">
            <DialogHeader>
              <DialogTitle data-testid="dialog-title">Confirm Registration</DialogTitle>
              <DialogDescription data-testid="dialog-description">
                Review details for <strong>{confirmDialog.participant?.name}</strong> before approving.
              </DialogDescription>
            </DialogHeader>
            {confirmDialog.participant && (
              <div className="space-y-6" data-testid="registration-details">
                {/* Participant/Organizer Info */}
                <div className="grid grid-cols-2 gap-4 border p-4 rounded-md bg-muted/20">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Organizer / Name</p>
                    <p className="font-medium">{confirmDialog.participant.name}</p>
                    <p className="text-sm text-muted-foreground">{confirmDialog.participant.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Roll No & Dept</p>
                    <p className="font-medium">{confirmDialog.participant.rollNo}</p>
                    <p className="text-sm text-muted-foreground">{confirmDialog.participant.dept}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">College</p>
                    <p className="font-medium">{confirmDialog.participant.college}</p>
                  </div>
                </div>

                {/* Events to be Confirmed */}
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Events to Confirm ({confirmDialog.pendingIds.length})
                  </h4>
                  <div className="space-y-3">
                    {confirmDialog.pendingIds.map(id => {
                      const reg = confirmDialog.participant.registrations.find((r: any) => r.id === id);
                      if (!reg) return null;

                      const teamMembers = reg.originalRegistration.teamMembers || [];

                      return (
                        <div key={id} className="border rounded-md p-3">
                          <div className="flex justify-between items-center mb-2">
                            <Badge variant="outline" className="text-base">{reg.eventName}</Badge>
                            <span className="text-xs font-mono text-muted-foreground">Team ID: {reg.teamId}</span>
                            <Badge variant="secondary">Pending</Badge>
                          </div>

                          {/* Team Members List */}
                          {teamMembers.length > 0 ? (
                            <div className="mt-2">
                              <p className="text-xs text-muted-foreground font-semibold mb-1">Team Members ({teamMembers.length})</p>
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-muted/50 h-8">
                                    <TableHead className="h-8 py-0">Name</TableHead>
                                    <TableHead className="h-8 py-0">Roll No</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {teamMembers.map((tm: any) => (
                                    <TableRow key={tm.id} className="h-8">
                                      <TableCell className="py-1">{tm.memberName}</TableCell>
                                      <TableCell className="py-1 text-xs font-mono">{tm.memberRollNo}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">Individual Participation</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-md flex gap-2 items-start">
                  <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div className="text-sm text-blue-900 dark:text-blue-200">
                    <p className="font-medium">Action Required</p>
                    <p>Clicking approve will generate credentials and email them to the organizer.</p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))} data-testid="button-cancel">
                Cancel
              </Button>
              <Button
                onClick={handleConfirmAction}
                disabled={confirmMutation.isPending || bulkConfirmMutation.isPending}
                data-testid="button-confirm-approve"
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {confirmMutation.isPending || bulkConfirmMutation.isPending
                  ? 'Confirming...'
                  : `Approve & Send Credentials (${confirmDialog.pendingIds.length})`
                }
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Credentials Dialog (Post-Success) */}
        <Dialog open={showCredentials} onOpenChange={setShowCredentials}>
          <DialogContent className="max-w-2xl" data-testid="dialog-credentials">
            <DialogHeader>
              <DialogTitle data-testid="credentials-title">
                <CheckCircle className="h-6 w-6 text-green-600 inline mr-2" />
                Registration Confirmed
              </DialogTitle>
              <DialogDescription data-testid="credentials-description">
                Share these credentials with the participants.
              </DialogDescription>
            </DialogHeader>
            {credentials && (
              <div className="space-y-4" data-testid="credentials-info">
                {credentials.eventCredentials.map((event) => (
                  <div key={event.eventId} className="p-4 bg-blue-50 dark:bg-blue-950 rounded-md">
                    <p className="font-semibold text-blue-900 dark:text-blue-100 mb-2">{event.eventName}</p>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Team ID:</span>
                        <code className="ml-2 font-mono">{event.teamId || 'â€”'}</code>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Username:</span>
                        <code className="ml-2 font-mono">{event.eventUsername}</code>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Password:</span>
                        <code className="ml-2 font-mono">{event.eventPassword}</code>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    Important: Make sure to save and share these credentials with the participants.
                  </p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={copyCredentials} variant="outline" data-testid="button-copy-credentials">
                <Copy className="h-4 w-4 mr-2" />
                Copy Credentials
              </Button>
              <Button onClick={() => {
                setShowCredentials(false);
                setCredentials(null);
              }} data-testid="button-close-credentials">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RegistrationCommitteeLayout >
  );
}
