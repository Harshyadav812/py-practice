import { type FC, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react';
import { X } from 'lucide-react';

/**
 * Custom edge that shows a delete (×) button when hovered.
 * Click the button to remove the connection — like n8n.
 */
export const DeletableEdge: FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
}) => {
  const { setEdges } = useReactFlow();
  const [hovered, setHovered] = useState(false);
  const showButton = hovered || selected;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEdges((edges) => edges.filter((edge) => edge.id !== id));
  };

  return (
    <>
      {/* Invisible fat hitbox path for easier hover detection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: 'pointer' }}
      />
      {/* Visible styled edge */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: showButton
            ? 'var(--color-accent, #6366f1)'
            : style.stroke || 'var(--color-border-hover)',
          strokeWidth: showButton ? 2.5 : 2,
          transition: 'stroke 0.15s ease, stroke-width 0.15s ease',
        }}
      />
      {/* Delete button at midpoint — only visible on hover/select */}
      {showButton && (
        <EdgeLabelRenderer>
          <button
            onClick={handleDelete}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: 'var(--color-error, #ef4444)',
              border: '2px solid var(--color-surface, #1a1a2e)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
              fontSize: 0,
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              zIndex: 10,
              transition: 'transform 0.1s ease',
            }}
            title="Delete connection"
          >
            <X size={12} strokeWidth={3} />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
