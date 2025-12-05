import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, CheckCircle, Clock, Download, UserPlus, Users } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import RegistrationCommitteeLayout from "@/components/layouts/RegistrationCommitteeLayout";
import type { Registration, Event, User, EventCredential, TeamMember } from "@shared/schema";

type OnSpotParticipant = User & {
  eventCredentials: Array<EventCredential & { event: Event }>;
};

interface RegistrationWithDetails extends Registration {
  event?: Event;
  teamMembers?: TeamMember[];
}

export default function RegistrationCommitteeDashboard() {
  const { toast } = useToast();

  const { data: registrations } = useQuery<RegistrationWithDetails[]>({
    queryKey: ['/api/registrations'],
  });

  const { data: events } = useQuery<Event[]>({
    queryKey: ['/api/events'],
  });

  const { data: onSpotParticipants } = useQuery<OnSpotParticipant[]>({
    queryKey: ['/api/registration-committee/participants'],
  });

  const formRegistrations = registrations?.length || 0;
  const pendingRegistrations = registrations?.filter(r => r.status === 'pending').length || 0;
  const confirmedRegistrations = registrations?.filter(r => r.status === 'confirmed').length || 0;
  const onSpotCount = onSpotParticipants?.length || 0;
  const totalRegistrations = formRegistrations + onSpotCount;

  const confirmedList = registrations?.filter(r => r.status === 'confirmed') || [];

  const getEventName = (eventId: string) => {
    const event = events?.find(e => e.id === eventId);
    return event?.name || eventId;
  };

  const getTotalMembers = (reg: RegistrationWithDetails) => {
    return 1 + (reg.teamMembers?.length || 0);
  };

  const downloadList = () => {
    if (confirmedList.length === 0) {
      toast({
        title: "No Data",
        description: "No confirmed participants to download",
        variant: "destructive",
      });
      return;
    }

    const content = confirmedList.map((reg, index) => {
      const eventName = reg.event?.name || getEventName(reg.eventId);
      const teamSize = getTotalMembers(reg);
      return `${index + 1}. ${reg.organizerName} - ${reg.organizerRollNo} - ${reg.organizerEmail} - ${reg.organizerDept} - Event: ${eventName} - Team Size: ${teamSize}`;
    }).join('\n');

    const fullContent = `CONFIRMED PARTICIPANTS LIST\n\nTotal Confirmed: ${confirmedList.length}\n\n${content}`;

    const blob = new Blob([fullContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `confirmed-participants-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Downloaded",
      description: "Participant list has been downloaded",
    });
  };

  return (
    <RegistrationCommitteeLayout>
      <div className="container mx-auto p-4 md:p-6 max-w-6xl" data-testid="page-reg-committee-dashboard">
        <div className="mb-6">
          <h1 className="text-3xl font-bold" data-testid="heading-dashboard">Dashboard</h1>
          <p className="text-muted-foreground">Registration Committee Overview</p>
        </div>

        <div className="grid gap-6 md:grid-cols-4 mb-6">
          <Card data-testid="card-total">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Total Registrations</CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total">{totalRegistrations}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-pending">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600" data-testid="stat-pending">{pendingRegistrations}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-confirmed">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">Confirmed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="stat-confirmed">{confirmedRegistrations}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-onspot">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium">On-Spot Registrations</CardTitle>
              <UserPlus className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600" data-testid="stat-onspot">{onSpotCount}</div>
            </CardContent>
          </Card>
        </div>

        <Card data-testid="card-quick-actions">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Manage registration confirmations</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Link href="/registration-committee/registrations">
              <Button data-testid="button-view-registrations">
                <ClipboardList className="h-4 w-4 mr-2" />
                View All Registrations
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={downloadList}
              disabled={confirmedList.length === 0}
              data-testid="button-download-pdf"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Confirmed List
            </Button>
          </CardContent>
        </Card>

        {confirmedList.length > 0 && (
          <Card data-testid="card-confirmed-list" className="mt-6">
            <CardHeader>
              <CardTitle>Confirmed Participants</CardTitle>
              <CardDescription>All confirmed and registered participants</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table data-testid="table-confirmed">
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Organizer</TableHead>
                      <TableHead>Roll No</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Team Size</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Confirmed Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {confirmedList.map((registration, index) => (
                      <TableRow key={registration.id} data-testid={`row-confirmed-${registration.id}`}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{registration.organizerName}</p>
                            <p className="text-sm text-muted-foreground">{registration.organizerEmail}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm">{registration.organizerRollNo}</code>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {registration.event?.name || getEventName(registration.eventId)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span>{getTotalMembers(registration)}</span>
                          </div>
                        </TableCell>
                        <TableCell>{registration.organizerDept}</TableCell>
                        <TableCell>
                          {registration.confirmedAt
                            ? new Date(registration.confirmedAt).toLocaleDateString()
                            : new Date(registration.createdAt).toLocaleDateString()
                          }
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </RegistrationCommitteeLayout>
  );
}
