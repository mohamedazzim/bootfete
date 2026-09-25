import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import EventAdminLayout from '@/components/layouts/EventAdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Users, Search, Filter, Eye, Download } from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Participant, Event, User } from '@shared/schema';

interface TeamGroupedParticipant {
  id: string;
  displayName: string;
  teamSize: number;
  registrationType: 'team' | 'solo';
  eventId: string;
  eventName: string;
  paperTopic?: string | null;
  status: string;
  registeredAt: Date;
  user: {
    fullName: string;
    email: string;
  };
  event: Event;
  teamMembers?: {
    memberName: string;
    memberRollNo: string;
    memberDept: string;
    memberEmail: string;
    memberPhone: string;
  }[];
  credentials?: {
    username: string;
    password: string;
    rollNo?: string | null;
  } | null;
}

export default function AllParticipantsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedTeamParticipant, setSelectedTeamParticipant] = useState<TeamGroupedParticipant | null>(null);

  const { data: participants, isLoading } = useQuery<TeamGroupedParticipant[]>({
    queryKey: ['/api/event-admin/participants'],
  });

  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const res = await apiRequest('GET', '/api/event-admin/participants/export');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'participants_credentials.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: "Export Successful",
        description: "Participant credentials have been downloaded.",
      });
    } catch (error) {
      console.error("Export failed:", error);
      toast({
        title: "Export Failed",
        description: "Could not download credentials.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const uniqueEvents = useMemo(() => {
    if (!participants) return [];
    const eventMap = new Map();
    participants.forEach(p => {
      if (p.event && !eventMap.has(p.event.id)) {
        eventMap.set(p.event.id, p.event);
      }
    });
    return Array.from(eventMap.values());
  }, [participants]);

  const filteredParticipants = useMemo(() => {
    if (!participants) return [];

    return participants.filter(participant => {
      const matchesSearch =
        (participant.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (participant.user?.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (participant.eventName || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesEvent = selectedEvent === 'all' || participant.eventId === selectedEvent;
      const matchesStatus = selectedStatus === 'all' || participant.status === selectedStatus;

      return matchesSearch && matchesEvent && matchesStatus;
    });
  }, [participants, searchTerm, selectedEvent, selectedStatus]);

  const statisticsByEvent = useMemo(() => {
    if (!participants) return [];

    const eventStats = new Map<string, { eventName: string; count: number; eventId: string }>();

    participants.forEach(participant => {
      const existing = eventStats.get(participant.eventId);
      if (existing) {
        existing.count++;
      } else {
        eventStats.set(participant.eventId, {
          eventName: participant.eventName,
          count: 1,
          eventId: participant.eventId
        });
      }
    });

    return Array.from(eventStats.values()).sort((a, b) => b.count - a.count);
  }, [participants]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      registered: 'secondary',
      participated: 'default',
      disqualified: 'destructive',
    };

    return (
      <Badge variant={variants[status] || 'default'} data-testid={`badge-status-${status}`}>
        {status}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <EventAdminLayout>
        <div className="p-8">
          <div className="text-center py-12" data-testid="loading-participants">Loading participants...</div>
        </div>
      </EventAdminLayout>
    );
  }

  return (
    <EventAdminLayout>
      <div className="p-4 md:p-8">
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900" data-testid="heading-all-participants">
                All Participants
              </h1>
              <p className="text-gray-600 mt-1">Manage participants across all your assigned events</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="text-right">
                <div className="text-3xl font-bold text-indigo-600" data-testid="text-total-participants">
                  {participants?.length || 0}
                </div>
                <div className="text-sm text-gray-600">Total Participants</div>
              </div>
              <Button onClick={handleExport} disabled={isExporting} variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                {isExporting ? 'Exporting...' : 'Export Credentials'}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Participants List</CardTitle>
              <div className="flex flex-col sm:flex-row gap-4 mt-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by name, email, or event..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search"
                  />
                </div>
                <Select value={selectedEvent} onValueChange={setSelectedEvent}>
                  <SelectTrigger className="w-full sm:w-48" data-testid="select-event-filter">
                    <SelectValue placeholder="Filter by event" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Events</SelectItem>
                    {uniqueEvents.map((event) => (
                      <SelectItem key={event.id} value={event.id} data-testid={`option-event-${event.id}`}>
                        {event.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-full sm:w-48" data-testid="select-status-filter">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="registered">Registered</SelectItem>
                    <SelectItem value="participated">Participated</SelectItem>
                    <SelectItem value="disqualified">Disqualified</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {!participants || participants.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-lg font-medium text-gray-600" data-testid="no-participants">
                    No participants found
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    Participants will appear here once they register for your events
                  </p>
                </div>
              ) : filteredParticipants.length === 0 ? (
                <div className="text-center py-12">
                  <Filter className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-lg font-medium text-gray-600" data-testid="no-filtered-participants">
                    No participants match your filters
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    Try adjusting your search or filter criteria
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Participant/Team</TableHead>
                        <TableHead>Event Name / Paper Topic</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Event Credentials</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredParticipants.map((participant) => {
                        const eventName = participant.eventName || '';
                        const isPaperEvent = eventName.toLowerCase().includes('paper') ||
                          eventName.toLowerCase().includes('quanta');

                        return (
                          <TableRow key={participant.id} data-testid={`row-participant-${participant.id}`}>
                            <TableCell>
                              <div>
                                <div className="font-medium" data-testid={`text-participant-name-${participant.id}`}>
                                  {participant.user.fullName}
                                </div>
                                <div className="text-sm text-gray-500">
                                  {participant.credentials?.rollNo ? (
                                    <span className="font-mono text-xs bg-gray-100 px-1 rounded mr-1">
                                      {participant.credentials.rollNo}
                                    </span>
                                  ) : null}
                                  {participant.registrationType === 'team' ? `Team of ${participant.teamSize}` : 'Solo'}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell data-testid={`text-event-name-${participant.id}`}>
                              {isPaperEvent && participant.paperTopic ? (
                                <div>
                                  <div className="font-medium">{participant.paperTopic}</div>
                                  <div className="text-sm text-gray-500">{participant.eventName}</div>
                                </div>
                              ) : (
                                participant.eventName
                              )}
                            </TableCell>
                            <TableCell>
                              {participant.registrationType === 'team' ? (
                                <Badge variant="default" className="gap-1">
                                  <Users className="h-3 w-3" />
                                  {participant.teamSize}
                                </Badge>
                              ) : (
                                <Badge variant="secondary">Solo</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {participant.credentials ? (
                                <div className="text-sm">
                                  <div className="flex items-center gap-1">
                                    <span className="text-gray-500 text-xs">ID:</span>
                                    <code className="bg-gray-100 px-1 rounded">{participant.credentials.username}</code>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-gray-500 text-xs">PW:</span>
                                    <code className="bg-gray-100 px-1 rounded">{participant.credentials.password}</code>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-gray-400 italic text-xs">No Creds</span>
                              )}
                            </TableCell>
                            <TableCell>{getStatusBadge(participant.status)}</TableCell>
                            <TableCell className="text-right">
                              {participant.registrationType === 'team' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedTeamParticipant(participant)}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Team
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-indigo-50 rounded-lg">
                  <div className="text-2xl font-bold text-indigo-600" data-testid="stat-total-participants">
                    {participants?.length || 0}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Total Participants</div>
                </div>

                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600" data-testid="stat-registered">
                    {participants?.filter(p => p.status === 'registered').length || 0}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Registered</div>
                </div>

                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600" data-testid="stat-participated">
                    {participants?.filter(p => p.status === 'participated').length || 0}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Participated</div>
                </div>

                <div className="p-4 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600" data-testid="stat-disqualified">
                    {participants?.filter(p => p.status === 'disqualified').length || 0}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Disqualified</div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-semibold text-sm text-gray-700 mb-3">By Event Breakdown</h3>
                  <div className="space-y-2">
                    {statisticsByEvent.length === 0 ? (
                      <p className="text-sm text-gray-500">No events with participants</p>
                    ) : (
                      statisticsByEvent.map((stat) => (
                        <div
                          key={stat.eventId}
                          className="flex justify-between items-center text-sm"
                          data-testid={`stat-event-${stat.eventId}`}
                        >
                          <span className="text-gray-600 truncate flex-1" title={stat.eventName}>
                            {stat.eventName}
                          </span>
                          <span className="font-semibold text-gray-900 ml-2">{stat.count}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Team Details Dialog */}
        <Dialog open={!!selectedTeamParticipant} onOpenChange={(open) => !open && setSelectedTeamParticipant(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Team Details</DialogTitle>
              <DialogDescription>
                Viewing team members for {selectedTeamParticipant?.displayName}
              </DialogDescription>
            </DialogHeader>

            {selectedTeamParticipant && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 border p-4 rounded-md bg-muted/20">
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Team Leader</h4>
                    <p className="font-medium">{selectedTeamParticipant.user.fullName}</p>
                    <p className="text-sm text-muted-foreground">{selectedTeamParticipant.user.email}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Event</h4>
                    <p className="font-medium">{selectedTeamParticipant.eventName}</p>
                    <p className="text-sm text-muted-foreground">Team Size: {selectedTeamParticipant.teamSize}</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Team Members ({selectedTeamParticipant.teamMembers?.length || 0})
                  </h4>
                  {selectedTeamParticipant.teamMembers && selectedTeamParticipant.teamMembers.length > 0 ? (
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
                          {selectedTeamParticipant.teamMembers.map((member, index) => (
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
              <Button variant="outline" onClick={() => setSelectedTeamParticipant(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {filteredParticipants.length > 0 && (
          <div className="text-sm text-gray-500 text-center">
            Showing {filteredParticipants.length} of {participants?.length || 0} participants
          </div>
        )}
      </div>
    </EventAdminLayout>
  );
}
