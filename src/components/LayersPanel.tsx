import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { GridState } from "../model/grid";

interface Props {
  grid: GridState;
  onSelectLayer: (index: number) => void;
  onAddLayer: () => void;
  onRemoveLayer: (index: number) => void;
  onMoveLayerUp: (index: number) => void;
  onMoveLayerDown: (index: number) => void;
}

export default function LayersPanel({ grid, onSelectLayer, onAddLayer, onRemoveLayer, onMoveLayerUp, onMoveLayerDown }: Props) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>Layers (Z stack)</h2>
      </div>
      <p className="muted sm">
        Each layer is one stacked slice of the part. Add layers to build upward; the 3D viewport
        always shows every layer, the 2D grid below edits only the selected one.
      </p>
      <div className="layer-list">
        {grid.layers.map((_, i) => {
          // List top-down (last layer = top of the model) so it reads like the physical stack.
          const layerIndex = grid.layers.length - 1 - i;
          const isTop = layerIndex === grid.layers.length - 1;
          const isBottom = layerIndex === 0;
          return (
            <div key={layerIndex} className={`layer-row${layerIndex === grid.activeLayer ? " active" : ""}`}>
              <button className="layer-select" onClick={() => onSelectLayer(layerIndex)}>
                Layer {layerIndex + 1}
                {isTop && <span className="muted sm"> (top)</span>}
              </button>
              <div className="layer-controls">
                <button
                  className="icon-btn sm ghost"
                  onClick={() => onMoveLayerUp(layerIndex)}
                  disabled={isTop}
                  title="Move layer up"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  className="icon-btn sm ghost"
                  onClick={() => onMoveLayerDown(layerIndex)}
                  disabled={isBottom}
                  title="Move layer down"
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  className="icon-btn sm ghost"
                  onClick={() => onRemoveLayer(layerIndex)}
                  disabled={grid.layers.length <= 1}
                  title="Remove this layer"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <button className="ghost sm" style={{ marginTop: 10 }} onClick={onAddLayer}>
        <Plus size={14} /> Add layer on top
      </button>
    </div>
  );
}
