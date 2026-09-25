import { io } from '../websocket';
import { storage } from '../storage';

export class WebSocketService {
  // Registration update - notify admins and registration committee
  static notifyRegistrationUpdate(eventId: string, registration: any) {
    if (!io) return;

    io.to('super_admin').emit('registrationUpdate', {
      type: 'new_registration',
      eventId,
      registration
    });
    io.to('registration_committee').emit('registrationUpdate', {
      type: 'new_registration',
      eventId,
      registration
    });
    io.to(`event:${eventId}`).emit('registrationUpdate', {
      type: 'new_registration',
      eventId,
      registration
    });
  }

  // Round status change - notify all participants of the event and admins
  static async notifyRoundStatus(eventId: string, roundId: string, status: string, round: any) {
    if (!io) return;

    const payload = {
      eventId,
      roundId,
      status,
      round
    };

    // Emit to super admins immediately
    io.to('super_admin').emit('roundStatus', payload);

    // Emit to event admin room
    io.to(`event:${eventId}`).emit('roundStatus', payload);

    // Emit only to participants registered for this event
    try {
      const participants = await storage.getParticipantsByEventId(eventId);
      participants.forEach((participant) => {
        io.to(`participant:${participant.userId}`).emit('roundStatus', payload);
      });
    } catch (error) {
      console.error('Failed to notify event participants of round status:', error);
    }
  }

  // Super admin override - notify all admins and affected users
  static notifyOverrideAction(action: string, targetType: string, targetId: string, changes: any) {
    if (!io) return;

    io.to('super_admin').emit('overrideAction', {
      action,
      targetType,
      targetId,
      changes,
      timestamp: new Date()
    });
    // If it's an event override, notify event admins
    if (targetType === 'event') {
      io.to(`event:${targetId}`).emit('overrideAction', {
        action,
        targetType,
        targetId,
        changes,
        timestamp: new Date()
      });
    }
  }

  // Result published - notify specific participant
  static notifyResultPublished(participantId: string, eventId: string, result: any) {
    if (!io) return;

    io.to(`participant:${participantId}`).emit('resultPublished', {
      eventId,
      result
    });
  }

  // Broadcast to specific event participants
  static broadcastToEvent(eventId: string, event: string, data: any) {
    if (!io) return;
    io.to(`event:${eventId}`).emit(event, data);
  }

  // Broadcast to all super admins
  static broadcastToSuperAdmins(event: string, data: any) {
    if (!io) return;
    io.to('super_admin').emit(event, data);
  }

  // Registration confirmed - notify admins and participant
  static notifyRegistrationConfirmed(registration: any) {
    if (!io) return;

    io.to('super_admin').emit('registrationConfirmed', registration);
    io.to('registration_committee').emit('registrationConfirmed', registration);
    if (registration.eventId) {
      io.to(`event:${registration.eventId}`).emit('registrationConfirmed', registration);
      
      // Also emit credentialsCreated to ensure credential queries refetch immediately
      // This triggers Event Admin dashboard to update participant/credential lists
      io.to(`event:${registration.eventId}`).emit('credentialsCreated', {
        eventId: registration.eventId,
        organizerName: registration.organizerName
      });
    }
  }

  // Test submitted - notify admins and update leaderboard
  static notifyTestSubmission(data: {
    userId: string;
    roundId: string;
    eventId: string;
    attemptId: string;
    score?: number;
  }) {
    if (!io) return;

    io.to('super_admin').emit('testSubmitted', data);
    io.to(`event:${data.eventId}`).emit('testSubmitted', data);
  }

  // Credentials created - notify participant
  static notifyCredentialsCreated(participantId: string, eventId: string, credentials: any) {
    if (!io) return;

    io.to(`participant:${participantId}`).emit('credentialsCreated', {
      eventId,
      credentials
    });
  }

  // Generic data refresh - for triggering UI updates
  static notifyDataRefresh(type: string, eventId?: string) {
    if (!io) return;

    const data = { type, eventId };
    io.to('super_admin').emit('dataRefresh', data);
    io.to('registration_committee').emit('dataRefresh', data);
    if (eventId) {
      io.to(`event:${eventId}`).emit('dataRefresh', data);
    }
  }

  // Manual round entry added
  static notifyManualRoundEntry(eventId: string, entry: any) {
    if (!io) return;

    io.to('super_admin').emit('manualRoundEntry', { eventId, entry });
    io.to(`event:${eventId}`).emit('manualRoundEntry', { eventId, entry });
  }

  // Winner declared
  static notifyWinnerDeclared(eventId: string, eventName: string, winner: any) {
    if (!io) return;

    const data = { eventId, eventName, winner };
    io.to('super_admin').emit('winnerDeclared', data);
    io.to(`event:${eventId}`).emit('winnerDeclared', data);
    io.to('registration_committee').emit('winnerDeclared', data);
  }
}
