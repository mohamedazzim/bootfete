import { useQuery, useMutation } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play, Pause, Square, Clock, Eye, Ban } from "lucide-react";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Event, Round } from "@shared/schema";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, BarChart, FileQuestion, Edit, Trash2, Trophy } from "lucide-react";
import AdminLayout from "@/components/layouts/AdminLayout";
import ScrollableTable from '@/components/ScrollableTable';

export default function TestManagerPage() {
    const { toast } = useToast();
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [eventFilter, setEventFilter] = useState<string>("all");

    // Fetch all events with their rounds
    // Note: we might need a dedicated endpoint for this if the data is heavy, 
    // but for now we iterate events or add a specific admin endpoint.
    // Let's use the existing structure or assume we might need a new endpoint.
    // Actually, let's fetch events and then rounds for each? No, that's N+1.
    // Better to use /api/event-admin/events but that's for event admins.
    // Super admins see all. 
    // Let's assume we can fetch all events and then their rounds, OR simpler:
    // Add a new endpoint GET /api/super-admin/all-rounds-status which returns flattened data.
    // For now, let's try to list events and expand them? Or just use the existing endpoints.
    // Assuming /api/events returns all for superadmin.
    const { data: events, isLoading: eventsLoading } = useQuery<Event[]>({
        queryKey: ["/api/events"], // This returns all events for super_admin/ultimate_admin
    });

    // We need to fetch rounds for ALL events. This is tricky with current API structure 
    // unless we make N requests. 
    // Ideally we should have `GET /api/super-admin/rounds/all`.
    // Let's implement that in backend later. 
    // For now, to unblock, let's just show events and let user click into them? 
    // Or just Create the frontend assuming the data comes from a new endpoint.
    // I'll create `GET /api/super-admin/all-rounds` in the backend next.
    const { data: allRounds, isLoading: roundsLoading } = useQuery<(Round & { eventName: string; eventId: string })[]>({
        queryKey: ["/api/super-admin/all-rounds"],
    });

    const updateStatusMutation = useMutation({
        mutationFn: async ({ roundId, action, duration }: { roundId: string; action: 'start' | 'pause' | 'resume' | 'end'; duration?: number }) => {
            let endpoint = '';
            let body = {};
            switch (action) {
                case 'start':
                    endpoint = `/api/rounds/${roundId}/start`;
                    if (duration) body = { duration };
                    break;
                case 'pause': endpoint = `/api/rounds/${roundId}/pause`; break;
                case 'resume': endpoint = `/api/rounds/${roundId}/resume`; break;
                case 'end': endpoint = `/api/rounds/${roundId}/end`; break;
            }
            await apiRequest("POST", endpoint, body);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/super-admin/all-rounds"] });
            toast({ title: "Success", description: "Round status updated successfully" });
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const deleteTestDataMutation = useMutation({
        mutationFn: async (roundId: string) => {
            await apiRequest("DELETE", `/api/rounds/${roundId}/test-data`);
        },
        onSuccess: (_, roundId) => {
            queryClient.invalidateQueries({ queryKey: ["/api/super-admin/all-rounds"] });
            toast({
                title: "Test Data Deleted",
                description: "All test attempts and answers have been removed. The round is now ready to be re-run.",
            });
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const deleteRoundMutation = useMutation({
        mutationFn: async (roundId: string) => {
            await apiRequest("DELETE", `/api/rounds/${roundId}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/super-admin/all-rounds"] });
            queryClient.invalidateQueries({ queryKey: ["/api/events"] });
            toast({
                title: "Round Deleted",
                description: "The round and all associated data have been permanently deleted.",
            });
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    if (eventsLoading || roundsLoading) {
        return (
            <AdminLayout>
                <div className="flex justify-center items-center min-h-[50vh]">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </AdminLayout>
        );
    }

    const filteredRounds = allRounds?.filter((round: any) => {
        const matchesSearch = round.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            round.eventName.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === "all" ||
            round.status === statusFilter ||
            (statusFilter === 'not_started' && round.status === 'upcoming') ||
            (statusFilter === 'in_progress' && round.status === 'active');
        const matchesEvent = eventFilter === "all" || round.eventId === eventFilter;
        return matchesSearch && matchesStatus && matchesEvent;
    }) || [];

    return (
        <AdminLayout>
        <div className="space-y-6 container mx-auto p-6 max-w-7xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Test Manager</h1>
                    <p className="text-muted-foreground">Manage test rounds, schedules, and statuses across all events.</p>
                </div>
            </div>

            <div className="flex gap-4 items-center">
                <Input
                    placeholder="Search Event or Round..."
                    className="max-w-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />

                <Select value={eventFilter} onValueChange={setEventFilter}>
                    <SelectTrigger className="w-[250px]">
                        <SelectValue placeholder="Filter by Event" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Events</SelectItem>
                        {events?.map((event: any) => (
                            <SelectItem key={event.id} value={event.id}>
                                {event.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="not_started">Not Started / Upcoming</SelectItem>
                        <SelectItem value="in_progress">In progress</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>All Rounds ({filteredRounds.length})</CardTitle>
                </CardHeader>
                <CardContent>
                                        <ScrollableTable>

                      <Table>
                                              <TableHeader>
                                                  <TableRow>
                                                      <TableHead>Event</TableHead>
                                                      <TableHead>Round</TableHead>
                                                      <TableHead>Schedule</TableHead>
                                                      <TableHead>Duration</TableHead>
                                                      <TableHead>Status</TableHead>
                                                      <TableHead className="text-right w-[200px]">Actions</TableHead>
                                                  </TableRow>
                                              </TableHeader>
                                              <TableBody>
                                                  {filteredRounds.length === 0 ? (
                                                      <TableRow>
                                                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                                              No rounds found.
                                                          </TableCell>
                                                      </TableRow>
                                                  ) : (
                                                      filteredRounds.map((round: any) => (
                                                          <TableRow key={round.id}>
                                                              <TableCell className="font-medium">{round.eventName}</TableCell>
                                                              <TableCell>{round.name}</TableCell>
                                                              <TableCell>
                                                                  <div className="flex flex-col text-sm">
                                                                      <span className="text-muted-foreground">Start:</span>
                                                                      <span>{round.startTime ? format(new Date(round.startTime), "PP p") : "Not set"}</span>
                                                                      <span className="text-muted-foreground mt-1">End:</span>
                                                                      <span>{round.endTime ? format(new Date(round.endTime), "PP p") : "Not set"}</span>
                                                                  </div>
                                                              </TableCell>
                                                              <TableCell>{round.duration} mins</TableCell>
                                                              <TableCell>
                                                                  <StatusBadge domain="round" status={round.status} />
                                                              </TableCell>
                                                              <TableCell className="text-right">
                                                                  <div className="flex items-center justify-end gap-2">
                                                                      {/* 1. Primary Action Button */}
                                                                      {(round.status === 'not_started' || round.status === 'upcoming') && (
                                                                          <Dialog>
                                                                              <DialogTrigger asChild>
                                                                                  <Button size="sm" className="w-24 bg-green-600 hover:bg-green-700">
                                                                                      <Play className="w-4 h-4 mr-1" /> Start
                                                                                  </Button>
                                                                              </DialogTrigger>
                                                                              <DialogContent>
                                                                                  <DialogHeader>
                                                                                      <DialogTitle>Start Round</DialogTitle>
                                                                                  </DialogHeader>
                                                                                  <StartRoundForm
                                                                                      round={round}
                                                                                      onStart={(duration) => updateStatusMutation.mutate({ roundId: round.id, action: 'start', duration })}
                                                                                      isPending={updateStatusMutation.isPending}
                                                                                  />
                                                                              </DialogContent>
                                                                          </Dialog>
                                                                      )}

                                                                      {(round.status === 'in_progress' || round.status === 'active') && (
                                                                          <Button
                                                                              size="sm"
                                                                              variant="outline"
                                                                              className="w-24 border-yellow-500 text-yellow-600 hover:bg-yellow-50"
                                                                              onClick={() => updateStatusMutation.mutate({ roundId: round.id, action: 'pause' })}
                                                                              disabled={updateStatusMutation.isPending}
                                                                          >
                                                                              <Pause className="w-4 h-4 mr-1" /> Pause
                                                                          </Button>
                                                                      )}

                                                                      {round.status === 'paused' && (
                                                                          <Button
                                                                              size="sm"
                                                                              className="w-24 bg-blue-600 hover:bg-blue-700"
                                                                              onClick={() => updateStatusMutation.mutate({ roundId: round.id, action: 'resume' })}
                                                                              disabled={updateStatusMutation.isPending}
                                                                          >
                                                                              <Play className="w-4 h-4 mr-1" /> Resume
                                                                          </Button>
                                                                      )}

                                                                      {round.status === 'completed' && (
                                                                          <Button size="sm" variant="secondary" className="w-24" disabled>
                                                                              Completed
                                                                          </Button>
                                                                      )}

                                                                      {/* 2. Monitor / Results Button (Always visible if relevant) */}
                                                                      <Button size="sm" variant="ghost" asChild title="Monitor">
                                                                          <Link href={`/event-admin/rounds/${round.id}/monitor`}>
                                                                              <BarChart className="w-4 h-4 text-gray-600" />
                                                                          </Link>
                                                                      </Button>

                                                                      <Button size="sm" variant="ghost" asChild title="View Results">
                                                                          <Link href={`/event-admin/events/${round.eventId}/results`}>
                                                                              <Trophy className="w-4 h-4 text-yellow-600" />
                                                                          </Link>
                                                                      </Button>

                                                                      {/* 3. More Actions Dropdown */}
                                                                      <Dialog>
                                                                          <DropdownMenu>
                                                                              <DropdownMenuTrigger asChild>
                                                                                  <Button variant="ghost" className="h-8 w-8 p-0">
                                                                                      <span className="sr-only">Open menu</span>
                                                                                      <MoreHorizontal className="h-4 w-4" />
                                                                                  </Button>
                                                                              </DropdownMenuTrigger>
                                                                              <DropdownMenuContent align="end">
                                                                                  <DropdownMenuLabel>Actions</DropdownMenuLabel>

                                                                                  <DropdownMenuItem asChild>
                                                                                      <Link href={`/event-admin/rounds/${round.id}/questions`} className="cursor-pointer">
                                                                                          <FileQuestion className="mr-2 h-4 w-4" />
                                                                                          Manage Questions
                                                                                      </Link>
                                                                                  </DropdownMenuItem>

                                                                                  <DialogTrigger asChild>
                                                                                      <DropdownMenuItem>
                                                                                          <Clock className="mr-2 h-4 w-4" />
                                                                                          Edit Schedule
                                                                                      </DropdownMenuItem>
                                                                                  </DialogTrigger>

                                                                                  {((round.status === 'in_progress' || round.status === 'active') || round.status === 'paused') && (
                                                                                      <>
                                                                                          <DropdownMenuSeparator />
                                                                                          <DropdownMenuItem
                                                                                              className="text-red-600 focus:text-red-600"
                                                                                              onClick={() => updateStatusMutation.mutate({ roundId: round.id, action: 'end' })}
                                                                                          >
                                                                                              <Square className="mr-2 h-4 w-4" />
                                                                                              End Round
                                                                                          </DropdownMenuItem>
                                                                                      </>
                                                                                  )}

                                                                                  <DropdownMenuSeparator />
                                                                                  <DropdownMenuItem
                                                                                      className="text-red-600 focus:text-red-600"
                                                                                      onClick={() => {
                                                                                          if (window.confirm(`Are you sure you want to delete ALL test data for "${round.name}"? This will remove all attempts and answers. This action cannot be undone.`)) {
                                                                                              deleteTestDataMutation.mutate(round.id);
                                                                                          }
                                                                                      }}
                                                                                  >
                                                                                      <Trash2 className="mr-2 h-4 w-4" />
                                                                                      Delete Test Data
                                                                                  </DropdownMenuItem>
                                                                                  <DropdownMenuItem
                                                                                      className="text-red-600 focus:text-red-600 font-semibold"
                                                                                      onClick={() => {
                                                                                          if (window.confirm(`⚠️ DANGER: Are you sure you want to PERMANENTLY DELETE the round "${round.name}"?\n\nThis will delete:\n• The round itself\n• All questions\n• All test attempts\n• All answers\n\nThis action CANNOT be undone!`)) {
                                                                                              deleteRoundMutation.mutate(round.id);
                                                                                          }
                                                                                      }}
                                                                                  >
                                                                                      <Trash2 className="mr-2 h-4 w-4" />
                                                                                      Delete Round
                                                                                  </DropdownMenuItem>
                                                                              </DropdownMenuContent>
                                                                          </DropdownMenu>

                                                                          {/* Dialog Content for Edit Schedule (Nested logic) */}
                                                                          <DialogContent>
                                                                              <DialogHeader>
                                                                                  <DialogTitle>Edit Schedule</DialogTitle>
                                                                              </DialogHeader>
                                                                              <EditScheduleForm round={round} />
                                                                          </DialogContent>
                                                                      </Dialog>
                                                                  </div>
                                                              </TableCell>
                                                          </TableRow>
                                                      ))
                                                  )}
                                              </TableBody>
                                          </Table>
                                        </ScrollableTable>
                 </CardContent>
             </Card>
        </div>
        </AdminLayout>
    );
}

function EditScheduleForm({ round }: { round: any }) {
    const { toast } = useToast();
    const updateMutation = useMutation({
        mutationFn: async (data: any) => {
            await apiRequest("PATCH", `/api/rounds/${round.id}`, data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/super-admin/all-rounds"] });
            toast({ title: "Updated", description: "Schedule updated" });
        }
    });

    const [duration, setDuration] = useState(round.duration);

    return (
        <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
                Set the duration for this round. The start/end times will be calculated when you actually <strong>Start</strong> the round.
            </p>
            <div className="grid gap-2">
                <Label>Duration (mins)</Label>
                <Input type="number" value={duration} onChange={e => setDuration(parseInt(e.target.value))} />
            </div>
            <Button onClick={() => updateMutation.mutate({ duration })} disabled={updateMutation.isPending}>
                Save Duration Only
            </Button>
        </div>
    );
}

function StartRoundForm({ round, onStart, isPending }: { round: any, onStart: (duration: number) => void, isPending: boolean }) {
    const [duration, setDuration] = useState(round.duration);

    return (
        <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
                Starting this round will set the Start Time to <strong>NOW</strong> and calculate the End Time based on the duration below.
            </p>
            <div className="grid gap-2">
                <Label>Duration (minutes)</Label>
                <Input
                    type="number"
                    value={duration}
                    onChange={e => setDuration(parseInt(e.target.value))}
                    min={1}
                />
            </div>
            <DialogFooter>
                <Button onClick={() => onStart(duration)} disabled={isPending}>
                    {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Start Round Now
                </Button>
            </DialogFooter>
        </div>
    );
}
