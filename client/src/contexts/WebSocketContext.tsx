import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/queryClient';

interface WebSocketContextType {
  isConnected: boolean;
  socket: Socket | null;
}

const WebSocketContext = createContext<WebSocketContextType>({
  isConnected: false,
  socket: null
});

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const { toast } = useToast();

  const refetchEventQueries = (eventId?: string) => {
    if (!eventId) return;
    queryClient.refetchQueries({ queryKey: ['/api/events', eventId] });
    queryClient.refetchQueries({ queryKey: ['/api/events', eventId, 'rounds'] });
    queryClient.refetchQueries({ queryKey: [`/api/events/${eventId}/registrations`] });
    queryClient.refetchQueries({ queryKey: [`/api/events/${eventId}/event-credentials`] });
    queryClient.refetchQueries({ queryKey: [`/api/events/${eventId}/participants`] });
    queryClient.refetchQueries({ queryKey: [`/api/events/${eventId}/leaderboard`] });
    queryClient.refetchQueries({ queryKey: [`/api/events/${eventId}/rounds`] });
    queryClient.refetchQueries({ queryKey: [`/api/events/${eventId}/winners`] });
    queryClient.refetchQueries({ queryKey: [`/api/events/${eventId}/manual-round-entries`] });
  };
  const { user, token } = useAuth();

  useEffect(() => {
    if (!token || !user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    const socket = io(window.location.origin, {
      auth: { token },
      // C-05: prefer a single websocket connection over the polling handshake.
      // Polling needs consecutive HTTP requests to hit the same PM2 worker
      // (sticky sessions); websocket-first avoids that requirement, and
      // polling remains as a fallback for networks that block upgrades.
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('WebSocket connected');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('WebSocket disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });

    socket.on('registrationUpdate', (data) => {
      toast({
        title: 'New Registration',
        description: `New participant registered for ${data.registration?.eventName || 'an event'}`,
      });

      // Force IMMEDIATE refetch for all registration-related queries
      queryClient.refetchQueries({ queryKey: ['/api/registrations'] });
      queryClient.refetchQueries({ queryKey: ['/api/registrations/colleges'] });

      // Super Admin dashboard - immediate update
      queryClient.refetchQueries({ queryKey: ['/api/admin/stats'] });
      queryClient.refetchQueries({ queryKey: ['/api/events'] });

      // Event admin dashboard stats - immediate update
      queryClient.refetchQueries({ queryKey: ['/api/event-admin/my-event'] });
      queryClient.refetchQueries({ queryKey: ['/api/event-admin/stats'] });

      // Event-specific registrations
      refetchEventQueries(data.eventId);
    });

    socket.on('roundStatus', (data) => {
      toast({
        title: 'Round Status Update',
        description: `Round ${data.round?.name || 'round'} is now ${data.status}`,
      });

      // Force IMMEDIATE refetch (not just invalidation) for critical queries
      if (data.roundId) {
        queryClient.refetchQueries({ queryKey: [`/api/rounds/${data.roundId}`] });
        queryClient.refetchQueries({ queryKey: ['/api/rounds', data.roundId] });
      }
      refetchEventQueries(data.eventId);

      // CRITICAL: Force immediate refetch of participant credential for dashboard update
      queryClient.refetchQueries({ queryKey: ['/api/participants/my-credential'] });

      // H-13: refetch in-progress attempts too. On pause/resume the server
      // shifts attempt.startedAt forward; without this the participant's
      // countdown keeps counting paused time and auto-submits early.
      queryClient.refetchQueries({ queryKey: ['/api/attempts'] });

      // Super Admin Test Manager - immediate refresh
      queryClient.refetchQueries({ queryKey: ['/api/super-admin/all-rounds'] });
    });

    socket.on('overrideAction', (data) => {
      toast({
        title: 'Admin Override',
        description: `${data.targetType} has been ${data.action}`,
        variant: 'destructive'
      });
    });

    socket.on('resultPublished', (data) => {
      toast({
        title: 'Results Published',
        description: 'Your test results are now available',
      });

      // Force IMMEDIATE refetch of result and leaderboard
      refetchEventQueries(data.eventId);
      queryClient.refetchQueries({ queryKey: ['/api/participants/my-attempts'] });
    });

    // Registration confirmed (approval) - force IMMEDIATE refetch
    socket.on('registrationConfirmed', (data) => {
      toast({
        title: 'Registration Confirmed',
        description: `${data.organizerName || 'Participant'}'s registration has been confirmed`,
      });

      // Force immediate refetch of all registration-related queries
      queryClient.refetchQueries({ queryKey: ['/api/registrations'] });
      queryClient.refetchQueries({ queryKey: ['/api/participants/my-credential'] });
      // Event admin dashboard and stats - CRITICAL for immediate update
      queryClient.refetchQueries({ queryKey: ['/api/event-admin/my-event'] });
      queryClient.refetchQueries({ queryKey: ['/api/event-admin/stats'] });
      refetchEventQueries(data.eventId);
    });

    // Test submitted - IMMEDIATE leaderboard update
    socket.on('testSubmitted', (data) => {
      if (data.roundId) {
        queryClient.refetchQueries({ queryKey: [`/api/rounds/${data.roundId}/leaderboard`] });
        queryClient.refetchQueries({ queryKey: [`/api/rounds/${data.roundId}/statistics`] });
      }
      refetchEventQueries(data.eventId);
      // Refresh Super Admin view if checking submissions via test manager
      queryClient.refetchQueries({ queryKey: ['/api/super-admin/all-rounds'] });
    });

    // Leaderboard update event - for direct leaderboard broadcasts
    socket.on('leaderboardUpdate', (data) => {
      if (data.roundId) {
        queryClient.refetchQueries({ queryKey: [`/api/rounds/${data.roundId}/leaderboard`] });
        queryClient.refetchQueries({ queryKey: [`/api/rounds/${data.roundId}/statistics`] });
      }
      refetchEventQueries(data.eventId);
    });

    // Credentials created - IMMEDIATE update
    socket.on('credentialsCreated', (data) => {
      toast({
        title: 'Credentials Ready',
        description: `${data.organizerName ? `${data.organizerName}'s credentials are ready` : 'Event credentials are now available'}`,
      });

      queryClient.refetchQueries({ queryKey: ['/api/participants/my-credential'] });
      refetchEventQueries(data.eventId);
      // Event admin stats for immediate dashboard update
      queryClient.refetchQueries({ queryKey: ['/api/event-admin/my-event'] });
      queryClient.refetchQueries({ queryKey: ['/api/event-admin/stats'] });
    });

    // Data refresh event - generic refresh trigger for any data updates
    socket.on('dataRefresh', (data) => {
      // Force immediate refetch based on type
      if (data.type === 'registrations') {
        queryClient.refetchQueries({ queryKey: ['/api/registrations'] });
      }
      if (data.type === 'participants') {
        queryClient.refetchQueries({ queryKey: ['/api/event-admin/my-event'] });
        queryClient.refetchQueries({ queryKey: ['/api/event-admin/stats'] });
      }
      if (data.type === 'results') {
        queryClient.refetchQueries({ queryKey: ['/api/participants/my-attempts'] });
      }
      refetchEventQueries(data.eventId);
    });

    // Manual round entry added - for physical/manual rounds
    socket.on('manualRoundEntry', (data) => {
      refetchEventQueries(data.eventId);
      queryClient.refetchQueries({ queryKey: ['/api/super-admin/all-rounds'] });
    });

    // Winner declared
    socket.on('winnerDeclared', (data) => {
      toast({
        title: 'Winner Declared',
        description: `Winners have been announced for ${data.eventName || 'an event'}`,
      });

      refetchEventQueries(data.eventId);
      queryClient.refetchQueries({ queryKey: ['/api/events'] });
    });

    return () => {
      socket.disconnect();
    };
  }, [toast, user, token]);

  return (
    <WebSocketContext.Provider value={{ isConnected, socket: socketRef.current }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}
