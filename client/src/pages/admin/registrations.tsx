import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import AdminLayout from "@/components/layouts/AdminLayout";
import type { Registration, Event } from "@shared/schema";

export default function AdminRegistrationsPage() {
  const { data: registrations, isLoading } = useQuery<Registration[]>({
    queryKey: ['/api/registrations'],
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const confirmMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/registrations/${id}/confirm`);
      return res.json();
    },
    onSuccess: () => {
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

  const { data: events } = useQuery<Event[]>({
    queryKey: ['/api/events'],
  });

  const getEventName = (eventId: string) => {
    const event = events?.find(e => e.id === eventId);
    return event?.name || eventId;
  };

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

  return (
    <AdminLayout>
      <div className="container mx-auto p-4 md:p-6 max-w-7xl" data-testid="page-admin-registrations">
        <div className="mb-6">
          <h1 className="text-3xl font-bold" data-testid="heading-registrations">All Registrations</h1>
          <p className="text-muted-foreground">View and manage event registrations</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Registration Submissions</CardTitle>
            <CardDescription>All registration form submissions from participants</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div data-testid="loading-registrations">Loading registrations...</div>
            ) : registrations && registrations.length > 0 ? (
              <div className="overflow-x-auto">
                <Table data-testid="table-registrations">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Roll No</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Selected Events</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {registrations.map((registration: any) => (
                      <TableRow key={registration.id} data-testid={`row-registration-${registration.id}`}>
                        <TableCell>
                          {registration.organizerRollNo || 'N/A'}
                        </TableCell>
                        <TableCell data-testid={`text-name-${registration.id}`}>
                          <div className="font-medium">
                            {registration.organizerName || 'N/A'}
                            <span className="text-xs text-muted-foreground ml-2">(Leader)</span>
                          </div>
                          {registration.teamMembers && registration.teamMembers.length > 0 && (
                            <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                              {registration.teamMembers.map((m: any) => (
                                <div key={m.id} className="flex items-center gap-2">
                                  <span>{m.memberName}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell data-testid={`text-email-${registration.id}`}>
                          {registration.organizerEmail || 'N/A'}
                        </TableCell>
                        <TableCell data-testid={`text-events-${registration.id}`}>
                          <div className="flex flex-wrap gap-1">
                            {registration.event ? (
                              <Badge variant="outline" className="text-xs">
                                {registration.event.name}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">No events</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusColor(registration.status)} data-testid={`badge-status-${registration.id}`}>
                            {registration.status}
                          </Badge>
                        </TableCell>
                        <TableCell data-testid={`text-submitted-${registration.id}`}>
                          {new Date(registration.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {registration.status === 'pending' && (
                            <Button
                              size="sm"
                              onClick={() => confirmMutation.mutate(registration.id)}
                              disabled={confirmMutation.isPending}
                            >
                              {confirmMutation.isPending ? "Confirming..." : "Confirm"}
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
      </div>
    </AdminLayout>
  );
}
