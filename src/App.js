import React, { useRef, useState, useEffect } from "react";
import { Stage, Layer, Image, Text, Transformer } from "react-konva";
import Konva from "konva";

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.src = src;
  });
}

function loadVideo(src) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.crossOrigin = "Anonymous";
    video.src = src;
    video.onloadedmetadata = () => resolve(video);
    video.load();
  });
}

const INITIAL_HISTORY = [[]];

function App() {
  const [elements, setElements] = useState([]);
  const [text, setText] = useState("");
  const [selectedElementIndex, setSelectedElementIndex] = useState(null);
  const [history, setHistory] = useState(INITIAL_HISTORY);
  const [historyStep, setHistoryStep] = useState(0);
  const stageRef = useRef(null);
  const transformerRef = useRef(null);
  const animationRefs = useRef({});

  const updateHistory = (newElements) => {
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newElements);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
    setElements(newElements);
  };
  const handleUndo = () => {
    if (historyStep > 0) {
      setHistoryStep((s) => s - 1);
      setElements(history[historyStep - 1]);
    }
  };
  const handleRedo = () => {
    if (historyStep < history.length - 1) {
      setHistoryStep((s) => s + 1);
      setElements(history[historyStep + 1]);
    }
  };

  const moveSelected = (dx, dy) => {
    if (selectedElementIndex === null) return;
    const newElements = [...elements];
    const el = newElements[selectedElementIndex];
    newElements[selectedElementIndex] = {
      ...el,
      x: (el.x || 0) + dx,
      y: (el.y || 0) + dy,
    };
    updateHistory(newElements);
  };

  const bringForward = () => {
    if (
      selectedElementIndex === null ||
      selectedElementIndex === elements.length - 1
    )
      return;
    const newElements = [...elements];
    const temp = newElements[selectedElementIndex];
    newElements[selectedElementIndex] = newElements[selectedElementIndex + 1];
    newElements[selectedElementIndex + 1] = temp;
    updateHistory(newElements);
    setSelectedElementIndex(selectedElementIndex + 1);
  };

  const sendBackward = () => {
    if (selectedElementIndex === null || selectedElementIndex === 0) return;
    const newElements = [...elements];
    const temp = newElements[selectedElementIndex];
    newElements[selectedElementIndex] = newElements[selectedElementIndex - 1];
    newElements[selectedElementIndex - 1] = temp;
    updateHistory(newElements);
    setSelectedElementIndex(selectedElementIndex - 1);
  };

  const addImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const img = await loadImage(reader.result);
        const newElement = {
          type: "image",
          x: 50,
          y: 50,
          width: img.naturalWidth,
          height: img.naturalHeight,
          src: reader.result,
        };
        updateHistory([...elements, newElement]);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const addText = () => {
    if (!text.trim()) return;
    const newElement = {
      type: "text",
      x: 50,
      y: 150,
      width: 100,
      text: text,
      fontSize: 24,
    };
    updateHistory([...elements, newElement]);
    setText("");
  };

  const addVideo = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/*";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      loadVideo(url).then((video) => {
        const newElement = {
          type: "video",
          x: 50,
          y: 200,
          width: video.videoWidth,
          height: video.videoHeight,
          src: url,
          playing: false,
        };
        updateHistory([...elements, newElement]);
      });
    };
    input.click();
  };

  const toggleVideo = (index) => {
    setElements((prev) => {
      const newElements = [...prev];
      newElements[index] = {
        ...newElements[index],
        playing: !newElements[index].playing,
      };
      return newElements;
    });
  };

  const saveState = () => {
    localStorage.setItem(
      "canvasState",
      JSON.stringify({
        elements,
        history,
        historyStep,
      })
    );
  };

  const loadState = () => {
    const saved = localStorage.getItem("canvasState");
    if (saved) {
      const {
        elements: els,
        history: hist,
        historyStep: hStep,
      } = JSON.parse(saved);
      Promise.all(
        els.map(async (el) => {
          if (el.type === "image") {
            return { ...el };
          }
          if (el.type === "video") {
            return { ...el, playing: false };
          }
          return el;
        })
      ).then((rehydrated) => {
        setElements(rehydrated);
        setHistory(hist || [rehydrated]);
        setHistoryStep(hStep ?? (hist ? hist.length - 1 : 0));
      });
    }
  };

  const [hydratedElements, setHydratedElements] = useState([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      elements.map(async (el) => {
        if (el.type === "image") {
          const img = await loadImage(el.src);
          return { ...el, image: img };
        }
        if (el.type === "video") {
          const video = await loadVideo(el.src);
          return { ...el, videoElement: video };
        }
        return el;
      })
    ).then((hydrated) => {
      if (!cancelled) setHydratedElements(hydrated);
    });
    return () => {
      cancelled = true;
    };
  }, [elements]);

  useEffect(() => {
    hydratedElements.forEach((el, idx) => {
      if (el.type === "video" && el.videoElement) {
        if (el.playing) {
          el.videoElement.play();
          if (!animationRefs.current[idx]) {
            animationRefs.current[idx] = new Konva.Animation(() => {
              stageRef.current.getLayers()[0].batchDraw();
            }, stageRef.current.getLayers()[0]);
            animationRefs.current[idx].start();
          }
        } else {
          el.videoElement.pause();
          if (animationRefs.current[idx]) {
            animationRefs.current[idx].stop();
            animationRefs.current[idx] = null;
          }
        }
      }
    });
    return () => {
      Object.values(animationRefs.current).forEach(
        (anim) => anim && anim.stop()
      );
    };
  }, [hydratedElements]);

  const handleSelect = (index) => {
    setSelectedElementIndex(index);
    setTimeout(() => {
      const node = stageRef.current.findOne(`#element-${index}`);
      if (node) transformerRef.current.nodes([node]);
    }, 0);
  };

  const handleDragEnd = (index, e) => {
    const node = e.target;
    const newElements = [...elements];
    newElements[index] = {
      ...newElements[index],
      x: node.x(),
      y: node.y(),
    };
    updateHistory(newElements);
  };

  const handleTransformEnd = (index, e) => {
    const node = e.target;
    const newElements = [...elements];

    if (newElements[index].type === "text") {
      const newWidth = Math.max(5, node.width() * node.scaleX());
      newElements[index] = {
        ...newElements[index],
        x: node.x(),
        y: node.y(),
        width: newWidth,
      };
      node.scaleX(1);
      node.scaleY(1);
    } else {
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      newElements[index] = {
        ...newElements[index],
        x: node.x(),
        y: node.y(),
        width: Math.max(5, node.width() * scaleX),
        height: Math.max(5, node.height() * scaleY),
      };
      node.scaleX(1);
      node.scaleY(1);
    }

    updateHistory(newElements);
  };

  return (
    <div
      style={{
        fontFamily: "Inter, Segoe UI, Arial, sans-serif",
        background: "linear-gradient(135deg, #e0e7ff 0%, #f0fdfa 100%)",
        minHeight: "100vh",
      }}
    >
      <style>{`
        .toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          padding: 18px 24px;
          margin: 0 auto 18px auto;
          background: rgba(255,255,255,0.95);
          border-radius: 18px;
          box-shadow: 0 2px 24px 0 rgba(99,102,241,0.07);
          max-width: 960px;
          align-items: center;
        }
        .toolbar input[type="text"] {
          border: 1.5px solid #c7d2fe;
          border-radius: 8px;
          padding: 10px 13px;
          font-size: 17px;
          outline: none;
          transition: border 0.2s;
        }
        .toolbar input[type="text"]:focus {
          border: 1.5px solid #6366f1;
        }
        .toolbar-btn {
          background: linear-gradient(90deg, #6366f1 0%, #06b6d4 100%);
          color: #fff;
          padding: 10px 22px;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          box-shadow: 0 2px 8px rgba(99,102,241,0.08);
          cursor: pointer;
          transition: background 0.18s, transform 0.12s, box-shadow 0.18s;
          outline: none;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .toolbar-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .toolbar-btn:hover:not(:disabled), .toolbar-btn:focus:not(:disabled) {
          background: linear-gradient(90deg, #06b6d4 0%, #6366f1 100%);
          transform: translateY(-2px) scale(1.045);
          box-shadow: 0 4px 16px rgba(6,182,212,0.13);
        }
        .toolbar-btn--red {
          background: linear-gradient(90deg, #f43f5e 0%, #f59e42 100%);
        }
        .toolbar-btn--red:hover:not(:disabled), .toolbar-btn--red:focus:not(:disabled) {
          background: linear-gradient(90deg, #f59e42 0%, #f43f5e 100%);
        }
        .toolbar-btn--green {
          background: linear-gradient(90deg, #22c55e 0%, #06b6d4 100%);
        }
        .toolbar-btn--green:hover:not(:disabled), .toolbar-btn--green:focus:not(:disabled) {
          background: linear-gradient(90deg, #06b6d4 0%, #22c55e 100%);
        }
        .toolbar-btn--yellow {
          background: linear-gradient(90deg, #fde047 0%, #fbbf24 100%);
          color: #333;
        }
        .toolbar-btn--yellow:hover:not(:disabled), .toolbar-btn--yellow:focus:not(:disabled) {
          background: linear-gradient(90deg, #fbbf24 0%, #fde047 100%);
        }
      `}</style>

      <div className="toolbar">
        <button className="toolbar-btn" onClick={addImage} title="Add Image">
          🖼️ Upload Image
        </button>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type text"
          style={{ width: 130 }}
        />
        <button
          className="toolbar-btn toolbar-btn--green"
          onClick={addText}
          title="Add Text"
        >
          📝 Add Text
        </button>
        <button className="toolbar-btn" onClick={addVideo} title="Add Video">
          🎬 Upload Video
        </button>
        <button
          className="toolbar-btn"
          onClick={handleUndo}
          disabled={historyStep <= 0}
          title="Undo"
        >
          ↩️ Undo
        </button>
        <button
          className="toolbar-btn"
          onClick={handleRedo}
          disabled={historyStep >= history.length - 1}
          title="Redo"
        >
          ↪️ Redo
        </button>
        <button
          className="toolbar-btn toolbar-btn--yellow"
          onClick={saveState}
          title="Save Canvas"
        >
          💾 Save
        </button>
        <button
          className="toolbar-btn toolbar-btn--yellow"
          onClick={loadState}
          title="Load Canvas"
        >
          📂 Re-Load State
        </button>
        <button
          className="toolbar-btn"
          onClick={() => moveSelected(0, -20)}
          disabled={selectedElementIndex === null}
          title="Move Up"
        >
          ⬆️ Up
        </button>
        <button
          className="toolbar-btn"
          onClick={() => moveSelected(0, 20)}
          disabled={selectedElementIndex === null}
          title="Move Down"
        >
          ⬇️ Down
        </button>
        <button
          className="toolbar-btn"
          onClick={() => moveSelected(-20, 0)}
          disabled={selectedElementIndex === null}
          title="Move Left"
        >
          ⬅️ Left
        </button>
        <button
          className="toolbar-btn"
          onClick={() => moveSelected(20, 0)}
          disabled={selectedElementIndex === null}
          title="Move Right"
        >
          ➡️ Right
        </button>
        <button
          className="toolbar-btn toolbar-btn--green"
          onClick={bringForward}
          disabled={
            selectedElementIndex === null ||
            selectedElementIndex === elements.length - 1
          }
          title="Bring Forward"
        >
          ⬆️ Forward
        </button>
        <button
          className="toolbar-btn toolbar-btn--red"
          onClick={sendBackward}
          disabled={selectedElementIndex === null || selectedElementIndex === 0}
          title="Send Backward"
        >
          ⬇️ Backward
        </button>
      </div>
      <div
        style={{
          maxWidth: 1000,
          margin: "0 auto",
          borderRadius: 18,
          overflow: "hidden",
          boxShadow: "0 4px 32px 0 rgba(99,102,241,0.09)",
          background: "#fff",
        }}
      >
        <Stage
          width={Math.min(window.innerWidth, 1000)}
          height={window.innerHeight - 90}
          ref={stageRef}
          style={{
            border: "1.5px solid #c7d2fe",
            background: "linear-gradient(135deg, #f8fafc 0%, #e0e7ff 100%)",
            borderRadius: 18,
            cursor: selectedElementIndex === null ? "default" : "move",
          }}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage()) {
              setSelectedElementIndex(null);
              transformerRef.current.nodes([]);
            }
          }}
        >
          <Layer>
            {hydratedElements.map((element, index) => {
              if (element.type === "image" && element.image) {
                return (
                  <Image
                    key={index}
                    id={`element-${index}`}
                    image={element.image}
                    x={element.x}
                    y={element.y}
                    width={element.width}
                    height={element.height}
                    draggable
                    onClick={() => handleSelect(index)}
                    onTap={() => handleSelect(index)}
                    onDragEnd={(e) => handleDragEnd(index, e)}
                    onTransformEnd={(e) => handleTransformEnd(index, e)}
                    shadowColor="#6366f1"
                    shadowBlur={selectedElementIndex === index ? 18 : 0}
                    shadowOpacity={selectedElementIndex === index ? 0.25 : 0}
                  />
                );
              }
              if (element.type === "text") {
                return (
                  <Text
                    key={index}
                    id={`element-${index}`}
                    x={element.x}
                    y={element.y}
                    text={element.text}
                    fontSize={element.fontSize}
                    draggable
                    onClick={() => handleSelect(index)}
                    onTap={() => handleSelect(index)}
                    onDragEnd={(e) => handleDragEnd(index, e)}
                    onTransformEnd={(e) => handleTransformEnd(index, e)}
                    fill="#0ea5e9"
                    fontStyle={
                      selectedElementIndex === index ? "bold" : "normal"
                    }
                    shadowColor="#06b6d4"
                    shadowBlur={selectedElementIndex === index ? 12 : 0}
                    shadowOpacity={selectedElementIndex === index ? 0.22 : 0}
                  />
                );
              }
              if (element.type === "video" && element.videoElement) {
                return (
                  <React.Fragment key={index}>
                    <Image
                      id={`element-${index}`}
                      image={element.videoElement}
                      x={element.x}
                      y={element.y}
                      width={element.width}
                      height={element.height}
                      draggable
                      onClick={() => handleSelect(index)}
                      onTap={() => handleSelect(index)}
                      onDragEnd={(e) => handleDragEnd(index, e)}
                      onTransformEnd={(e) => handleTransformEnd(index, e)}
                      shadowColor="#6366f1"
                      shadowBlur={selectedElementIndex === index ? 18 : 0}
                      shadowOpacity={selectedElementIndex === index ? 0.25 : 0}
                    />
                    <Text
                      text={element.playing ? "⏸️" : "▶️"}
                      x={element.x + 8}
                      y={element.y + 8}
                      fontSize={28}
                      fill="#fff"
                      fontStyle="bold"
                      onClick={() => toggleVideo(index)}
                      style={{ cursor: "pointer" }}
                      shadowColor="#0ea5e9"
                      shadowBlur={6}
                      shadowOpacity={0.35}
                    />
                  </React.Fragment>
                );
              }
              return null;
            })}
            <Transformer
              ref={transformerRef}
              enabledAnchors={
                selectedElementIndex !== null &&
                elements[selectedElementIndex]?.type === "text"
                  ? ["middle-left", "middle-right"]
                  : undefined
              }
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 5 || newBox.height < 5) return oldBox;
                return newBox;
              }}
              anchorStroke="#6366f1"
              anchorFill="#fff"
              anchorSize={9}
              borderStroke="#6366f1"
              borderDash={[4, 4]}
            />
          </Layer>
        </Stage>
      </div>
    </div>
  );
}

export default App;
