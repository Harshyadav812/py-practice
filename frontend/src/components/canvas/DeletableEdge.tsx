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
 * Custom edge with n8n-style hover interactions:
 * - Subtle gray stroke that highlights on hover
 * - Delete (×) button at midpoint on hover/select
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
        strokeWidth={24}
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
            ? '#ff6d5a'
            : style.stroke || '#3a3a40',
          strokeWidth: showButton ? 2.5 : 1.5,
          transition: 'stroke 0.2s, stroke-width 0.2s',
        }}
      />
      {/* Delete button at midpoint */}
      {showButton && (
        <EdgeLabelRenderer>
          <button
            onClick={handleDelete}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="n8n-edge-delete"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            title="Delete connection"
          >
            <X size={10} strokeWidth={3} />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
