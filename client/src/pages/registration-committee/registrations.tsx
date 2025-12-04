import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Copy, CheckCircle, Search, Filter, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import RegistrationCommitteeLayout from "@/components/layouts/RegistrationCommitteeLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Registration, Event } from "@shared/schema";

export default function RegistrationCommitteeRegistrationsPage() {
  const { toast } = useToast();
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null);
  const [credentials, setCredentials] = useState<{
    main: { username: string; password: string; email: string };
    events: Array<{ eventId: string; eventName: string; eventUsername: string; eventPassword: string }>;
  } | null>(null);
  const [showCredentials, setShowCredentials] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [filterEvent, setFilterEvent] = useState<string>("all");
  const [filterCollege, setFilterCollege] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<string>("none");

  const { data: registrations, isLoading } = useQuery<Registration[]>({
    queryKey: ['/api/registrations'],
  });

  const { data: events } = useQuery<Event[]>({
    queryKey: ['/api/events'],
  });

  const approveMutation = useMutation({
    mutationFn: async (registrationId: string) => {
      const response = await apiRequest('PATCH', `/api/registrations/${registrationId}/approve`);
      const result = await response.json();
      return result;
    },
    onSuccess: (data) => {
      setCredentials({
        main: data.mainCredentials,
        events: data.eventCredentials || [],
      });
      setShowCredentials(true);
      setSelectedRegistration(null);
      queryClient.invalidateQueries({ queryKey: ['/api/registrations'] });
      toast({
        title: "Success",
        description: "Registration approved successfully",
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

  const extractParticipantInfo = (submittedData: Record<string, string>) => {
    const entries = Object.entries(submittedData);
    let name = 'N/A';
    let email = 'N/A';
    let phone = 'N/A';
    let college = 'N/A';
    
    for (const [key, value] of entries) {
      if (!value || typeof value !== 'string') continue;
      const lowerKey = key.toLowerCase();
      const trimmedValue = value.trim();
      
      if (lowerKey.includes('email') || trimmedValue.includes('@')) {
        email = trimmedValue;
      } else if (lowerKey.includes('phone') || lowerKey.includes('mobile') || lowerKey.includes('contact')) {
        phone = trimmedValue;
      } else if (lowerKey.includes('college') || lowerKey.includes('institution') || lowerKey.includes('school') || lowerKey.includes('university')) {
        college = trimmedValue;
      } else if (lowerKey.includes('name') && !lowerKey.includes('college') && !lowerKey.includes('institution')) {
        name = trimmedValue;
      }
    }
    
    if (name === 'N/A') {
      const nameEntry = entries.find(([k, v]) => {
        if (!v || typeof v !== 'string') return false;
        const lowerK = k.toLowerCase();
        return !lowerK.includes('college') && !lowerK.includes('institution') && 
               !lowerK.includes('school') && !lowerK.includes('university') &&
               !v.includes('@') && v.includes(' ') && v.length < 50;
      });
      if (nameEntry) name = nameEntry[1];
    }
    
    return { name, email, phone, college };
  };

  const uniqueColleges = useMemo(() => {
    if (!registrations) return [];
    const colleges = new Set<string>();
    registrations.forEach(reg => {
      const info = extractParticipantInfo(reg.submittedData);
      if (info.college && info.college !== 'N/A') {
        colleges.add(info.college);
      }
    });
    return Array.from(colleges).sort();
  }, [registrations]);

  const filteredRegistrations = useMemo(() => {
    if (!registrations) return [];
    
    return registrations.filter(reg => {
      const info = extractParticipantInfo(reg.submittedData);
      const searchLower = searchQuery.toLowerCase();
      
      const matchesSearch = !searchQuery || 
        info.name.toLowerCase().includes(searchLower) ||
        info.email.toLowerCase().includes(searchLower) ||
        info.phone.toLowerCase().includes(searchLower) ||
        info.college.toLowerCase().includes(searchLower);
      
      const matchesEvent = filterEvent === "all" || 
        (reg.selectedEvents && reg.selectedEvents.includes(filterEvent));
      
      const matchesCollege = filterCollege === "all" || 
        info.college === filterCollege;
      
      const matchesStatus = filterStatus === "all" || 
        reg.paymentStatus === filterStatus;
      
      return matchesSearch && matchesEvent && matchesCollege && matchesStatus;
    });
  }, [registrations, searchQuery, filterEvent, filterCollege, filterStatus]);

  const groupedRegistrations = useMemo(() => {
    if (groupBy === "none") {
      return { "All Registrations": filteredRegistrations };
    }
    
    const groups: Record<string, typeof filteredRegistrations> = {};
    
    filteredRegistrations.forEach(reg => {
      let groupKey = "Other";
      
      if (groupBy === "college") {
        const info = extractParticipantInfo(reg.submittedData);
        groupKey = info.college !== 'N/A' ? info.college : "Unknown College";
      } else if (groupBy === "event") {
        if (reg.selectedEvents && reg.selectedEvents.length > 0) {
          reg.selectedEvents.forEach(eventId => {
            const eventName = getEventName(eventId);
            if (!groups[eventName]) groups[eventName] = [];
            groups[eventName].push(reg);
          });
          return;
        } else {
          groupKey = "No Events Selected";
        }
      } else if (groupBy === "status") {
        groupKey = reg.paymentStatus.charAt(0).toUpperCase() + reg.paymentStatus.slice(1);
      }
      
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(reg);
    });
    
    return groups;
  }, [filteredRegistrations, groupBy, events]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'default';
      case 'pending':
        return 'secondary';
      case 'declined':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setFilterEvent("all");
    setFilterCollege("all");
    setFilterStatus("all");
    setGroupBy("none");
  };

  const copyAllCredentials = () => {
    if (credentials) {
      let text = `Main Account Credentials:\nUsername: ${credentials.main.username}\nPassword: ${credentials.main.password}\nEmail: ${credentials.main.email}\n\n`;
      
      if (credentials.events && credentials.events.length > 0) {
        text += `Event-Specific Credentials:\n`;
        credentials.events.forEach((event) => {
          text += `\n${event.eventName}:\nEvent Username: ${event.eventUsername}\nEvent Password: ${event.eventPassword}\n`;
        });
      }
      
      navigator.clipboard.writeText(text);
      toast({
        title: "Copied",
        description: "All credentials copied to clipboard",
      });
    }
  };

  const hasActiveFilters = searchQuery || filterEvent !== "all" || filterCollege !== "all" || filterStatus !== "all" || groupBy !== "none";

  return (
    <RegistrationCommitteeLayout>
      <div className="container mx-auto p-6 max-w-7xl" data-testid="page-reg-committee-registrations">
        <div className="mb-6">
          <h1 className="text-3xl font-bold" data-testid="heading-registrations">Registrations</h1>
          <p className="text-muted-foreground">Review and approve participant registrations</p>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Search & Filter
                </CardTitle>
                <CardDescription>Find registrations by name, phone, college, or event</CardDescription>
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, phone, email, college..."
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
              
              <Select value={filterCollege} onValueChange={setFilterCollege}>
                <SelectTrigger data-testid="select-college-filter">
                  <SelectValue placeholder="Filter by College" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Colleges</SelectItem>
                  {uniqueColleges.map(college => (
                    <SelectItem key={college} value={college}>{college}</SelectItem>
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
                  <SelectItem value="paid">Approved</SelectItem>
                  <SelectItem value="declined">Declined</SelectItem>
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
                  variant={groupBy === "college" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setGroupBy("college")}
                  data-testid="button-group-college"
                >
                  College
                </Button>
                <Button 
                  variant={groupBy === "event" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setGroupBy("event")}
                  data-testid="button-group-event"
                >
                  Event
                </Button>
                <Button 
                  variant={groupBy === "status" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setGroupBy("status")}
                  data-testid="button-group-status"
                >
                  Status
                </Button>
              </div>
              <span className="ml-auto text-sm text-muted-foreground">
                Showing {filteredRegistrations.length} of {registrations?.length || 0} registrations
              </span>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div data-testid="loading-registrations">Loading registrations...</div>
        ) : Object.entries(groupedRegistrations).map(([groupName, groupRegs]) => (
          <Card key={groupName} className="mb-4">
            <CardHeader>
              <CardTitle>{groupName}</CardTitle>
              <CardDescription>{groupRegs.length} registration(s)</CardDescription>
            </CardHeader>
            <CardContent>
              {groupRegs.length > 0 ? (
                <Table data-testid={`table-registrations-${groupName}`}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Registered Events</TableHead>
                      <TableHead>College Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupRegs.map((registration: any) => {
                      const info = extractParticipantInfo(registration.submittedData);
                      return (
                        <TableRow key={registration.id} data-testid={`row-registration-${registration.id}`}>
                          <TableCell data-testid={`text-name-${registration.id}`}>
                            {info.name}
                          </TableCell>
                          <TableCell data-testid={`text-phone-${registration.id}`}>
                            {info.phone}
                          </TableCell>
                          <TableCell data-testid={`text-events-${registration.id}`}>
                            <div className="flex flex-wrap gap-1">
                              {registration.selectedEvents && registration.selectedEvents.length > 0 ? (
                                registration.selectedEvents.map((eventId: string) => (
                                  <Badge key={eventId} variant="outline" className="text-xs">
                                    {getEventName(eventId)}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-muted-foreground text-sm">No events</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell data-testid={`text-college-${registration.id}`}>
                            {info.college}
                          </TableCell>
                          <TableCell>
                            <Badge variant={getStatusColor(registration.paymentStatus)} data-testid={`badge-status-${registration.id}`}>
                              {registration.paymentStatus}
                            </Badge>
                          </TableCell>
                          <TableCell data-testid={`text-submitted-${registration.id}`}>
                            {new Date(registration.submittedAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {registration.paymentStatus === 'pending' && (
                              <Button
                                size="sm"
                                onClick={() => setSelectedRegistration(registration)}
                                data-testid={`button-approve-${registration.id}`}
                              >
                                Approve
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground" data-testid="text-no-registrations">
                  No registrations match your filters
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

        <Dialog open={!!selectedRegistration} onOpenChange={(open) => !open && setSelectedRegistration(null)}>
          <DialogContent data-testid="dialog-approve">
            <DialogHeader>
              <DialogTitle data-testid="dialog-title">Approve Registration</DialogTitle>
              <DialogDescription data-testid="dialog-description">
                Review the registration details and mark as paid to create participant credentials
              </DialogDescription>
            </DialogHeader>
            {selectedRegistration && (
              <div className="space-y-3" data-testid="registration-details">
                <div className="space-y-2">
                  <h3 className="font-semibold text-base">Submitted Information:</h3>
                  {Object.entries(selectedRegistration.submittedData).map(([key, value]) => (
                    <div key={key} className="text-sm">
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <span className="font-medium">Selected Events: </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedRegistration.selectedEvents && selectedRegistration.selectedEvents.length > 0 ? (
                      selectedRegistration.selectedEvents.map((eventId) => (
                        <Badge key={eventId} variant="secondary">
                          {getEventName(eventId)}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground text-sm">No events selected</span>
                    )}
                  </div>
                </div>
                <div className="bg-muted/50 p-3 rounded-md text-sm">
                  <p className="font-medium mb-1">What will happen:</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>Participant account will be created</li>
                    <li>User will be registered for all {selectedRegistration.selectedEvents?.length || 0} selected event(s)</li>
                    <li>Login credentials will be generated</li>
                  </ul>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedRegistration(null)} data-testid="button-cancel">
                Cancel
              </Button>
              <Button
                onClick={() => selectedRegistration && approveMutation.mutate(selectedRegistration.id)}
                disabled={approveMutation.isPending}
                data-testid="button-confirm-approve"
              >
                {approveMutation.isPending ? 'Approving...' : 'Mark as Paid & Create Account'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showCredentials} onOpenChange={setShowCredentials}>
          <DialogContent className="max-w-3xl" data-testid="dialog-credentials">
            <DialogHeader>
              <DialogTitle data-testid="credentials-title">
                <CheckCircle className="h-6 w-6 text-green-600 inline mr-2" />
                Registration Approved
              </DialogTitle>
              <DialogDescription data-testid="credentials-description">
                Participant account created successfully. Share these credentials with the participant.
              </DialogDescription>
            </DialogHeader>
            {credentials && (
              <div className="space-y-4" data-testid="credentials-info">
                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-md">
                  <h3 className="font-semibold mb-2">Main Account Credentials</h3>
                  <div className="space-y-1 text-sm">
                    <div>
                      <span className="font-medium">Username: </span>
                      <code data-testid="text-main-username">{credentials.main.username}</code>
                    </div>
                    <div>
                      <span className="font-medium">Password: </span>
                      <code data-testid="text-main-password">{credentials.main.password}</code>
                    </div>
                    <div>
                      <span className="font-medium">Email: </span>
                      <code data-testid="text-main-email">{credentials.main.email}</code>
                    </div>
                  </div>
                </div>

                {credentials.events && credentials.events.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">Event-Specific Credentials</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      These credentials will be visible to event admins for their respective events.
                    </p>
                    <div className="space-y-2">
                      {credentials.events.map((event) => (
                        <div key={event.eventId} className="p-3 bg-blue-50 dark:bg-blue-950 rounded-md" data-testid={`event-cred-${event.eventId}`}>
                          <p className="font-semibold text-blue-900 dark:text-blue-100 mb-1">{event.eventName}</p>
                          <div className="text-sm space-y-0.5">
                            <div>
                              <span className="font-medium">Event Username: </span>
                              <code className="text-xs">{event.eventUsername}</code>
                            </div>
                            <div>
                              <span className="font-medium">Event Password: </span>
                              <code className="text-xs">{event.eventPassword}</code>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    Important: These credentials will only be shown once. Make sure to save and share them with the participant.
                  </p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={copyAllCredentials} variant="outline" data-testid="button-copy-credentials">
                <Copy className="h-4 w-4 mr-2" />
                Copy All Credentials
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
    </RegistrationCommitteeLayout>
  );
}
