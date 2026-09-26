import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/StatusBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Download, Printer, ArrowLeft, FileDown, PlayCircle, StopCircle, Users, UserCheck, Clock, Building, GraduationCap, Eye } from 'lucide-react';
import EventAdminLayout from '@/components/layouts/EventAdminLayout';
import type { Event } from '@shared/schema';
import ScrollableTable from '@/components/ScrollableTable';

interface EventCredentialWithDetails {
  id: string;
  participantUserId: string;
  eventId: string;
  eventUsername: string;
  eventPassword: string;
  createdAt: Date;
  participant: {
    id: string;
    username: string;
    email: string;
    fullName: string;
  };
  event: Event;
  paperTopic?: string | null;
}

interface TeamMember {
  memberName: string;
  memberRollNo: string;
  memberEmail: string;
  memberDept: string;
  memberPhone?: string;
}

interface Registration {
  id: string;
  eventId: string;
  organizerName: string;
  organizerRollNo: string;
  organizerEmail: string;
  organizerDept: string;
  organizerCollege?: string;
  organizerPhone?: string;
  registrationType: 'solo' | 'team';
  paperTopic?: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt: string;
  confirmedBy?: string;
  event?: Event;
  teamMembers?: TeamMember[];
}

export default function EventParticipantsPage() {
  const { eventId } = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('registrations');
  const [selectedTeamRegistration, setSelectedTeamRegistration] = useState<Registration | null>(null);

  const { data: event } = useQuery<Event>({
    queryKey: ['/api/events', eventId],
    enabled: !!eventId,
  });

  // Fetch ALL registrations (pending + confirmed)
  const { data: registrations = [], isLoading: registrationsLoading } = useQuery<Registration[]>({
    queryKey: [`/api/events/${eventId}/registrations`],
    enabled: !!eventId,
  });

  // Fetch credentials (only confirmed with generated logins)
  const { data: credentials = [], isLoading: credentialsLoading } = useQuery<EventCredentialWithDetails[]>({
    queryKey: [`/api/events/${eventId}/event-credentials`],
    enabled: !!eventId,
  });

  const bulkEnableMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('PATCH', `/api/events/${eventId}/credentials/enable-all-tests`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/event-credentials`] });
      toast({
        title: 'Success',
        description: data.message || 'Test access enabled for all participants',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to enable test access',
        variant: 'destructive',
      });
    },
  });

  const bulkDisableMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('PATCH', `/api/events/${eventId}/credentials/disable-all-tests`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/events/${eventId}/event-credentials`] });
      toast({
        title: 'Success',
        description: data.message || 'Test access disabled for all participants',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to disable test access',
        variant: 'destructive',
      });
    },
  });

  const handleDownloadIdPass = async (credentialId: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/event-credentials/${credentialId}/id-pass`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message || 'Failed to download ID pass');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `id-pass-${credentialId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to download ID pass',
        variant: 'destructive',
      });
    }
  };


  const escapeCsvValue = (value: any) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (/[",\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const handleExportRegistrations = () => {
    const isPaperPresentation = event?.name?.toLowerCase().includes('paper') || event?.name?.toLowerCase().includes('quanta');
    const headers = isPaperPresentation
      ? ['Name', 'Roll No', 'Email', 'Department', 'College', 'Paper Topic', 'Type', 'Status', 'Team Members']
      : ['Name', 'Roll No', 'Email', 'Department', 'College', 'Type', 'Status', 'Team Members'];
    const rows = registrations.map(r => isPaperPresentation
      ? [
        r.organizerName,
        r.organizerRollNo,
        r.organizerEmail,
        r.organizerDept,
        r.organizerCollege || 'N/A',
        r.paperTopic || 'Not specified',
        r.registrationType,
        r.status,
        r.teamMembers?.map(m => m.memberName).join('; ') || 'Solo',
      ]
      : [
        r.organizerName,
        r.organizerRollNo,
        r.organizerEmail,
        r.organizerDept,
        r.organizerCollege || 'N/A',
        r.registrationType,
        r.status,
        r.teamMembers?.map(m => m.memberName).join('; ') || 'Solo',
      ]
    );

    const csv = [headers, ...rows].map(row => row.map(escapeCsvValue).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event?.name || 'event'}-registrations.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCredentials = () => {
    const isPaperPresentation = event?.name?.toLowerCase().includes('paper') || event?.name?.toLowerCase().includes('quanta');
    const headers = isPaperPresentation
      ? ['Participant Name', 'Paper Topic', 'Event Username', 'Event Password', 'Signature']
      : ['Participant Name', 'Event Username', 'Event Password', 'Signature'];

    const rows = credentials.map(c => isPaperPresentation
      ? [c.participant.fullName, c.paperTopic || 'Not specified', c.eventUsername, c.eventPassword, '________________']
      : [c.participant.fullName, c.eventUsername, c.eventPassword, '________________']
    );

    const csv = [headers, ...rows].map(row => row.map(escapeCsvValue).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event?.name || 'event'}-credentials.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pendingCount = registrations.filter(r => r.status === 'pending').length;
  const confirmedCount = registrations.filter(r => r.status === 'confirmed').length;

  return (
    <EventAdminLayout>
      <div className="p-4 md:p-8">
        <Button
          variant="ghost"
          onClick={() => setLocation('/event-admin/events')}
          className="mb-4"
          data-testid="button-back"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to My Events
        </Button>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold" data-testid="heading-participants">Event Participants</h1>
            <p className="text-muted-foreground mt-2">{event?.name}</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{registrations.length}</p>
                  <p className="text-sm text-muted-foreground">Total Registrations</p>
                </div>
                <Users className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
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
                  <p className="text-2xl font-bold text-green-600">{confirmedCount}</p>
                  <p className="text-sm text-muted-foreground">Confirmed</p>
                </div>
                <UserCheck className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="registrations" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              All Registrations ({registrations.length})
            </TabsTrigger>
            <TabsTrigger value="credentials" className="flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              Confirmed with Credentials ({credentials.length})
            </TabsTrigger>
          </TabsList>

          {/* Registrations Tab */}
          <TabsContent value="registrations">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>All Registrations</CardTitle>
                    <CardDescription>Includes pending registrations awaiting approval</CardDescription>
                  </div>
                  <Button onClick={handleExportRegistrations} variant="outline" disabled={registrations.length === 0}>
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {registrationsLoading ? (
                  <div className="text-center py-8">Loading registrations...</div>
                ) : registrations.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No registrations yet</p>
                    <p className="text-sm">Registrations will appear once participants submit the form</p>
                  </div>
                ) : (
                                    <ScrollableTable>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Roll No</TableHead>
                          <TableHead>
                            <div className="flex items-center gap-1">
                              <Building className="h-3 w-3" />
                              College
                            </div>
                          </TableHead>
                          <TableHead>
                            <div className="flex items-center gap-1">
                              <GraduationCap className="h-3 w-3" />
                              Department
                            </div>
                          </TableHead>
                          {(event?.name?.toLowerCase().includes('paper') || event?.name?.toLowerCase().includes('quanta')) && (
                            <TableHead>Paper Topic</TableHead>
                          )}
                          <TableHead>Type</TableHead>
                          <TableHead>Registered</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {registrations.map((reg) => (
                          <TableRow key={reg.id}>
                            <TableCell><StatusBadge domain="registration" status={reg.status} /></TableCell>
                            <TableCell className="font-medium">
                              {reg.organizerName}
                              {reg.teamMembers && reg.teamMembers.length > 0 && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  + {reg.teamMembers.length} team member(s)
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{reg.organizerRollNo}</TableCell>
                            <TableCell>{reg.organizerCollege || <span className="text-muted-foreground">Not provided</span>}</TableCell>
                            <TableCell>{reg.organizerDept}</TableCell>
                            {(event?.name?.toLowerCase().includes('paper') || event?.name?.toLowerCase().includes('quanta')) && (
                              <TableCell>
                                {reg.paperTopic ? (
                                  <span className="font-medium text-blue-700">{reg.paperTopic}</span>
                                ) : (
                                  <span className="text-muted-foreground italic">Not specified</span>
                                )}
                              </TableCell>
                            )}
                            <TableCell>
                              <Badge variant="outline">{reg.registrationType}</Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(reg.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">
                              {reg.registrationType === 'team' && reg.teamMembers && reg.teamMembers.length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedTeamRegistration(reg)}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Team
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                                    </ScrollableTable>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Credentials Tab */}
          <TabsContent value="credentials">
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <CardTitle>Confirmed Participants</CardTitle>
                    <CardDescription>Participants with generated credentials (approved by Registration Committee)</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => bulkEnableMutation.mutate()}
                      variant="default"
                      disabled={credentials.length === 0 || bulkEnableMutation.isPending}
                      size="sm"
                    >
                      <PlayCircle className="h-4 w-4 mr-2" />
                      {bulkEnableMutation.isPending ? 'Enabling...' : 'Enable Test for All'}
                    </Button>
                    <Button
                      onClick={() => bulkDisableMutation.mutate()}
                      variant="destructive"
                      disabled={credentials.length === 0 || bulkDisableMutation.isPending}
                      size="sm"
                    >
                      <StopCircle className="h-4 w-4 mr-2" />
                      {bulkDisableMutation.isPending ? 'Disabling...' : 'Disable Test for All'}
                    </Button>
                    <Button onClick={handleExportCredentials} variant="outline" size="sm" disabled={credentials.length === 0}>
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {credentialsLoading ? (
                  <div className="text-center py-8">Loading credentials...</div>
                ) : credentials.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <UserCheck className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No confirmed participants yet</p>
                    <p className="text-sm">Credentials are generated when registrations are approved</p>
                  </div>
                ) : (
                                    <ScrollableTable>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Participant Name</TableHead>
                          {(event?.name?.toLowerCase().includes('paper') || event?.name?.toLowerCase().includes('quanta')) && (
                            <TableHead>Paper Topic</TableHead>
                          )}
                          <TableHead>Event Username</TableHead>
                          <TableHead>Event Password</TableHead>
                          <TableHead>Registration Date</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {credentials.map((cred) => (
                          <TableRow key={cred.id}>
                            <TableCell>{cred.participant.fullName}</TableCell>
                            {(event?.name?.toLowerCase().includes('paper') || event?.name?.toLowerCase().includes('quanta')) && (
                              <TableCell>{cred.paperTopic || <span className="text-muted-foreground">Not specified</span>}</TableCell>
                            )}
                            <TableCell className="font-mono">{cred.eventUsername}</TableCell>
                            <TableCell className="font-mono">{cred.eventPassword}</TableCell>
                            <TableCell>{new Date(cred.createdAt).toLocaleDateString()}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDownloadIdPass(cred.id)}
                              >
                                <FileDown className="h-4 w-4 mr-2" />
                                ID Pass
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                                    </ScrollableTable>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Team Details Dialog */}
        <Dialog open={!!selectedTeamRegistration} onOpenChange={(open) => !open && setSelectedTeamRegistration(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Team Details</DialogTitle>
              <DialogDescription>
                Viewing team members for {selectedTeamRegistration?.organizerName}
              </DialogDescription>
            </DialogHeader>

            {selectedTeamRegistration && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 border p-4 rounded-md bg-muted/20">
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Team Leader</h4>
                    <p className="font-medium">{selectedTeamRegistration.organizerName}</p>
                    <p className="text-sm text-muted-foreground">{selectedTeamRegistration.organizerEmail}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Leader Details</h4>
                    <p className="text-sm">Roll No: <span className="font-mono">{selectedTeamRegistration.organizerRollNo}</span></p>
                    <p className="text-sm">Dept: {selectedTeamRegistration.organizerDept}</p>
                    {selectedTeamRegistration.organizerPhone && (
                      <p className="text-sm">Phone: {selectedTeamRegistration.organizerPhone}</p>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Team Members ({selectedTeamRegistration.teamMembers?.length || 0})
                  </h4>
                  {selectedTeamRegistration.teamMembers && selectedTeamRegistration.teamMembers.length > 0 ? (
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>Name</TableHead>
                            <TableHead>Roll No</TableHead>
                            <TableHead>Department</TableHead>
                            <TableHead>Email</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedTeamRegistration.teamMembers.map((member, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium">{member.memberName}</TableCell>
                              <TableCell className="font-mono text-sm">{member.memberRollNo}</TableCell>
                              <TableCell>{member.memberDept}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{member.memberEmail}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-4 italic">No team members found.</p>
                  )}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setSelectedTeamRegistration(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </EventAdminLayout>
  );
}
