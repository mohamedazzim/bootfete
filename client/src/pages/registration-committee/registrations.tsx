import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Copy, CheckCircle, Search, Filter, X, Users } from "lucide-react";
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
  const [selectedRegistration, setSelectedRegistration] = useState<RegistrationWithDetails | null>(null);
  const [showCredentials, setShowCredentials] = useState(false);
  const [credentials, setCredentials] = useState<{
    eventCredentials: Array<{ eventId: string; eventName: string; eventUsername: string; eventPassword: string }>;
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
      setSelectedRegistration(null);
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
        eventName: reg.event?.name || getEventName(reg.eventId),
        eventId: reg.eventId,
        role: 'Leader',
        status: reg.status,
        registrationType: reg.registrationType,
        createdAt: new Date(reg.createdAt),
        originalRegistration: reg
      });

      // Process Team Members
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
              college: reg.organizerCollege || '', // Inherit college
              phone: member.memberPhone || '',
              registrations: []
            });
          }
          uniqueParticipantsMap.get(memberKey)!.registrations.push({
            id: reg.id, // Links to parent registration
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

  // 2. Filter the grouped unique participants
  const filteredParticipants = useMemo(() => {
    return groupedUniqueParticipants.filter(p => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery ||
        p.name.toLowerCase().includes(searchLower) ||
        p.email.toLowerCase().includes(searchLower) ||
        p.rollNo.toLowerCase().includes(searchLower) ||
        p.dept.toLowerCase().includes(searchLower);

      // Check if ANY of the participant's registrations match the filters
      const matchesEvent = filterEvent === "all" || p.registrations.some(r => r.eventId === filterEvent);
      const matchesStatus = filterStatus === "all" || p.registrations.some(r => r.status === filterStatus);
      const matchesCollege = filterCollege === "all" || p.college === filterCollege;

      return matchesSearch && matchesEvent && matchesStatus && matchesCollege;
    });
  }, [groupedUniqueParticipants, searchQuery, filterEvent, filterStatus, filterCollege]);

  // 3. Grouping for display (e.g. by College, Dept) - applied on the UNIQUE participants
  const displayedGroups = useMemo(() => {
    if (groupBy === "none" || groupBy === "event" || groupBy === "status") {
      // Logic adjustment: "Group by Event" or "Status" doesn't strictly make sense for a person with MULTIPLE events/statuses
      // So we might disable those groups or just group by "Mixed" if they have multiple.
      // For simplicity and correctness with the new view, we might only support grouping by College/Dept meaningfully, 
      // or "None" which lists everyone.
      // If user selects "Group By Event", we could list them under "Multiple Events" or duplicate them (which goes against the requirement).
      // Let's stick to simple "All Participants" if grouping doesn't fit well, or group by primary attribute.
      return { "All Participants": filteredParticipants };
    }

    const groups: Record<string, typeof filteredParticipants> = {};

    filteredParticipants.forEach(p => {
      let groupKey = "Other";

      if (groupBy === "dept") {
        groupKey = p.dept || "Unknown";
      } else if (groupBy === "college") {
        groupKey = p.college || "Unknown";
      }

      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(p);
    });

    return groups;
  }, [filteredParticipants, groupBy]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'default';
      case 'pending':
        return 'secondary';
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline';
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
        text += `\n${event.eventName}:\nUsername: ${event.eventUsername}\nPassword: ${event.eventPassword}\n`;
      });

      navigator.clipboard.writeText(text);
      toast({
        title: "Copied",
        description: "Credentials copied to clipboard",
      });
    }
  };

  const hasActiveFilters = searchQuery || filterEvent !== "all" || filterStatus !== "all" || filterCollege !== "all" || groupBy !== "none";

  const getTotalMembers = (reg: RegistrationWithDetails) => {
    return 1 + (reg.teamMembers?.length || 0); // 1 for organizer + team members
  };

  return (
    <RegistrationCommitteeLayout>
      <div className="container mx-auto p-4 md:p-6 max-w-7xl" data-testid="page-reg-committee-registrations">
        <div className="mb-6">
          <h1 className="text-3xl font-bold" data-testid="heading-registrations">Registrations</h1>
          <p className="text-muted-foreground">Review and confirm participant registrations</p>
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
                {/* Disabled logical grouping by Event/Status for consolidated view */}
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
                                  <span className="text-xs text-muted-foreground">({reg.role})</span>
                                  <Badge variant={getStatusColor(reg.status)} className="text-xs h-5 px-1.5">{reg.status}</Badge>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {p.registrations.filter(r => r.status === 'pending').map(reg => (
                                <Button
                                  key={reg.id}
                                  size="sm"
                                  className="h-7 text-xs w-full"
                                  onClick={() => setSelectedRegistration(reg.originalRegistration)}
                                  data-testid={`button-confirm-${reg.id}`}
                                >
                                  Confirm {reg.eventName}
                                </Button>
                              ))}
                            </div>
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

        {/* Confirm Registration Dialog */}
        <Dialog open={!!selectedRegistration} onOpenChange={(open) => !open && setSelectedRegistration(null)}>
          <DialogContent className="max-w-2xl" data-testid="dialog-confirm">
            <DialogHeader>
              <DialogTitle data-testid="dialog-title">Confirm Registration</DialogTitle>
              <DialogDescription data-testid="dialog-description">
                Review the registration details and confirm to create participant credentials
              </DialogDescription>
            </DialogHeader>
            {selectedRegistration && (
              <div className="space-y-4" data-testid="registration-details">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Organizer</p>
                    <p className="font-medium">{selectedRegistration.organizerName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Roll No</p>
                    <p className="font-medium">{selectedRegistration.organizerRollNo}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{selectedRegistration.organizerEmail}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Department</p>
                    <p className="font-medium">{selectedRegistration.organizerDept}</p>
                  </div>
                  {selectedRegistration.organizerCollege && (
                    <div>
                      <p className="text-sm text-muted-foreground">College</p>
                      <p className="font-medium">{selectedRegistration.organizerCollege}</p>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-2">Event</p>
                  <Badge variant="outline" className="text-base py-1 px-3">
                    {selectedRegistration.event?.name || getEventName(selectedRegistration.eventId)}
                  </Badge>
                </div>

                {selectedRegistration.teamMembers && selectedRegistration.teamMembers.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">
                      Team Members ({selectedRegistration.teamMembers.length})
                    </p>
                    <div className="space-y-2">
                      {selectedRegistration.teamMembers.map((member) => (
                        <div key={member.id} className="flex items-center justify-between p-2 bg-muted rounded">
                          <div>
                            <p className="font-medium">{member.memberName}</p>
                            <p className="text-sm text-muted-foreground">{member.memberEmail}</p>
                          </div>
                          <code className="text-sm">{member.memberRollNo}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-muted/50 p-3 rounded-md text-sm">
                  <p className="font-medium mb-1">What will happen:</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>• Event credentials will be created for all team members</li>
                    <li>• Total {getTotalMembers(selectedRegistration)} participant(s) will be registered</li>
                    <li>• Credentials will be shown for distribution</li>
                  </ul>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedRegistration(null)} data-testid="button-cancel">
                Cancel
              </Button>
              <Button
                onClick={() => selectedRegistration && confirmMutation.mutate(selectedRegistration.id)}
                disabled={confirmMutation.isPending}
                data-testid="button-confirm-approve"
              >
                {confirmMutation.isPending ? 'Confirming...' : 'Confirm & Create Credentials'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Credentials Dialog */}
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
