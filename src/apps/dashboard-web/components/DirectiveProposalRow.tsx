import React from 'react';
import type { Proposal } from '../../../shared/types';

interface DirectiveProposalRowProps {
  proposal: Proposal;
  isReached: boolean;
  statusBadgeClass: string;
  priorityBadgeClass: string;
  onEditProposal?: (proposal: Proposal) => void;
  onDragStart?: (e: React.DragEvent, proposal: Proposal) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onProposalClick?: (proposal: Proposal) => void;
}

const DirectiveProposalRow: React.FC<DirectiveProposalRowProps> = ({ 
  proposal, 
  isReached,
  statusBadgeClass,
  priorityBadgeClass,
  onEditProposal, 
  onDragStart,
  onDragEnd,
  onProposalClick 
}) => {
  return (
    <div 
      className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
      onClick={() => onProposalClick?.(proposal)}
      draggable
      onDragStart={(e) => onDragStart?.(e, proposal)}
      onDragEnd={(e) => onDragEnd?.(e)}
    >
      <div className="flex items-center gap-2">
        <h3 className="font-medium text-gray-900 dark:text-white">{proposal.title}</h3>
        <span className={statusBadgeClass}>{proposal.status}</span>
        <span className={priorityBadgeClass}>{proposal.priority}</span>
        {isReached && <span className="text-green-600">✓</span>}
      </div>
    </div>
  );
};

export default DirectiveProposalRow;
