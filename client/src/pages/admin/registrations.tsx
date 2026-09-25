import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import AdminLayout from "@/components/layouts/AdminLayout";
import { CheckCircle, Clock, Users, AlertCircle, TrendingUp, Download } from "lucide-react";
import type { Registration, Event, TeamMember } from "@shared/schema";

interface GroupedParticipant {
  rollNo: string;
  name: string;
  email: string;
  // Expanding type to include teamMembers which might be on the registration object from backend join
  registrations: Array<Registration & { event?: Event, teamMembers?: TeamMember[] }>;
  allPending: boolean;
  allConfirmed: boolean;
  pendingIds: string[];
  confirmedCount: number;
  pendingCount: number;
  college?: string;
  dept?: string;
}

export default function AdminRegistrationsPage() {
  const { data: registrations, isLoading } = useQuery<any[]>({
    queryKey: ['/api/registrations'],
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // CSV helpers
  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const handleExportCsv = () => {
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

    registrations.forEach((reg: any) => {
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
        reg.teamMembers.forEach((tm: any) => {
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
  };

  // Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    participant: GroupedParticipant | null;
    pendingIds: string[];
  }>({
    isOpen: false,
    participant: null,
    pendingIds: []
  });

  // Group registrations by participant roll number
  const groupedParticipants = useMemo<GroupedParticipant[]>(() => {
    if (!registrations) return [];

    const grouped = new Map<string, GroupedParticipant>();

    registrations.forEach((reg: any) => {
      const key = reg.organizerRollNo || reg.organizerEmail;

      if (!grouped.has(key)) {
        grouped.set(key, {
          rollNo: reg.organizerRollNo || 'N/A',
          name: reg.organizerName || 'N/A',
          email: reg.organizerEmail || 'N/A',
          registrations: [],
          allPending: true,
          allConfirmed: true,
          pendingIds: [],
          confirmedCount: 0,
          pendingCount: 0,
          college: reg.organizerCollege,
          dept: reg.organizerDept
        });
      }

      const participant = grouped.get(key)!;
      participant.registrations.push(reg);

      if (reg.status === 'pending') {
        participant.allConfirmed = false;
        participant.pendingIds.push(reg.id);
        participant.pendingCount++;
      } else if (reg.status === 'confirmed') {
        participant.allPending = false;
        participant.confirmedCount++;
      }
    });

    return Array.from(grouped.values());
  }, [registrations]);

  // Bulk confirm mutation
  const bulkConfirmMutation = useMutation({
    mutationFn: async (registrationIds: string[]) => {
      const res = await apiRequest("POST", `/api/registrations/bulk-confirm`, { registrationIds });
      return res.json();
    },
    onSuccess: (data) => {
      setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      queryClient.invalidateQueries({ queryKey: ['/api/registrations'] });
      toast({
        title: "Success",
        description: data.message || "Registrations confirmed successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to confirm registrations",
        variant: "destructive",
      });
    },
  });

  // Single confirm mutation (kept for backwards compatibility)
  const confirmMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/registrations/${id}/confirm`);
      return res.json();
    },
    onSuccess: () => {
      setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      queryClient.invalidateQueries({ queryKey: ['/api/registrations'] });
      toast({
        title: "Success",
        description: "Registration confirmed and credentials generated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to confirm registration",
        variant: "destructive",
      });
    },
  });

  const handleConfirmClick = (participant: GroupedParticipant, pendingIds: string[]) => {
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

  const totalParticipants = groupedParticipants.length;
  const pendingParticipants = groupedParticipants.filter(p => p.pendingCount > 0).length;
  const confirmedParticipants = groupedParticipants.filter(p => p.allConfirmed).length;

  return (
    <AdminLayout>
      <div className="container mx-auto p-4 md:p-6 max-w-7xl" data-testid="page-admin-registrations">
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold" data-testid="heading-registrations">All Registrations</h1>
            <p className="text-muted-foreground">View and manage event registrations (grouped by participant)</p>
          </div>
          <Button variant="outline" onClick={handleExportCsv} disabled={!registrations || registrations.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{totalParticipants}</p>
                  <p className="text-sm text-muted-foreground">Total Participants</p>
                </div>
                <Users className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-yellow-600">{pendingParticipants}</p>
                  <p className="text-sm text-muted-foreground">Pending Approval</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-green-600">{confirmedParticipants}</p>
                  <p className="text-sm text-muted-foreground">Fully Confirmed</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Registration Submissions</CardTitle>
            <CardDescription>Grouped by participant - one confirm button per participant</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div data-testid="loading-registrations">Loading registrations...</div>
            ) : groupedParticipants.length > 0 ? (
              <div className="overflow-x-auto">
                <Table data-testid="table-registrations">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Roll No</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Registered Events</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedParticipants.map((participant) => (
                      <TableRow key={participant.rollNo} data-testid={`row-participant-${participant.rollNo}`}>
                        <TableCell className="font-mono">
                          {participant.rollNo}
                        </TableCell>
                        <TableCell data-testid={`text-name-${participant.rollNo}`}>
                          <div className="font-medium">
                            {participant.name}
                            <span className="text-xs text-muted-foreground ml-2">(Leader)</span>
                          </div>
                          {/* Show team members from first registration */}
                          {participant.registrations[0]?.teamMembers && participant.registrations[0].teamMembers.length > 0 && (
                            <div className="text-sm text-muted-foreground mt-1">
                              + {participant.registrations[0].teamMembers.length} team member(s)
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{participant.email}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {participant.registrations.map((reg: any) => (
                              <Badge
                                key={reg.id}
                                variant={reg.status === 'confirmed' ? 'default' : 'outline'}
                                className={reg.status === 'confirmed' ? 'bg-green-100 text-green-800' : ''}
                              >
                                {reg.event?.name || 'Unknown Event'}
                                {reg.status === 'confirmed' && <CheckCircle className="h-3 w-3 ml-1" />}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          {participant.allConfirmed ? (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              All Confirmed
                            </Badge>
                          ) : participant.allPending ? (
                            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                              <Clock className="h-3 w-3 mr-1" />
                              Pending ({participant.pendingCount})
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700">
                              Partial ({participant.confirmedCount}/{participant.registrations.length})
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {participant.pendingIds.length > 0 && (
                            <Button
                              size="sm"
                              onClick={() => handleConfirmClick(participant, participant.pendingIds)}
                              disabled={confirmMutation.isPending || bulkConfirmMutation.isPending}
                            >
                              {participant.pendingIds.length === 1 ? "Confirm" : `Confirm All (${participant.pendingIds.length})`}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-no-registrations">
                No registrations yet
              </div>
            )}
          </CardContent>
        </Card>

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
                    <p className="text-sm text-muted-foreground">{confirmDialog.participant.dept || '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">College</p>
                    <p className="font-medium">{confirmDialog.participant.college || '-'}</p>
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
                      const reg = confirmDialog.participant?.registrations.find((r: any) => r.id === id);
                      if (!reg) return null;

                      const teamMembers = reg.teamMembers || [];

                      return (
                        <div key={id} className="border rounded-md p-3">
                          <div className="flex justify-between items-center mb-2">
                            <Badge variant="outline" className="text-base">{reg.event?.name || 'Unknown Event'}</Badge>
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
                                    <TableHead className="h-8 py-0">Status</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {teamMembers.map((tm: any) => (
                                    <TableRow key={tm.id} className="h-8">
                                      <TableCell className="py-1">{tm.memberName}</TableCell>
                                      <TableCell className="py-1 text-xs font-mono">{tm.memberRollNo}</TableCell>
                                      <TableCell className="py-1 text-xs">Member</TableCell>
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
      </div>
    </AdminLayout>
  );
}
