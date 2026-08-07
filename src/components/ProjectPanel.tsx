import { useRef, useState } from "react";
import { createEmptyGrid, GridState } from "../model/grid";
import { deserializeProject } from "../model/project";
import ConfirmDialog from "./ConfirmDialog";

interface Props {
  grid: GridState;
  onLoad: (grid: GridState) => void;
}

export default function ProjectPanel({ grid, onLoad }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      onLoad(deserializeProject(text));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Couldn't load that project file.");
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>Project</h2>
      </div>
      <p className="muted sm">Project save/load/clear are now in the top action bar.</p>
      <input
        ref={fileInput}
        type="file"
        accept="application/json"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      {confirmingClear && (
        <ConfirmDialog
          title="Clear the grid?"
          message="This replaces the current project with a blank grid and can't be undone."
          confirmLabel="Clear"
          onConfirm={() => {
            onLoad(createEmptyGrid(grid.width, grid.height));
            setConfirmingClear(false);
          }}
          onCancel={() => setConfirmingClear(false)}
        />
      )}
      {errorMessage && (
        <ConfirmDialog title="Error" message={errorMessage} onConfirm={() => setErrorMessage(null)} />
      )}
    </div>
  );
}
