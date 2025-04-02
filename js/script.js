document.addEventListener('DOMContentLoaded', function() {
  /******************************************
   *         GLOBAL STATE & ELEMENTS
   ******************************************/
  let currentConnection = null;
  let connections = []; // Each connection: { fromBoxId, toBoxId, line, deleteBtn }
  let boxMap = {};      // Maps box IDs to DOM elements
  let brushMode = false;

  // Pan/Zoom state (declared here so helper functions can use them)
  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let isPanning = false;
  let panStart = { x: 0, y: 0 };

  const canvasWrapper = document.getElementById('canvasWrapper');
  const canvas = document.getElementById('canvas');
  const svg = document.getElementById('connection-lines');

  /******************************************
   *            MENU CONTROLS
   ******************************************/
  document.getElementById('addBox').addEventListener('click', addBox);
  document.getElementById('newProfile').addEventListener('click', newProfile);
  document.getElementById('saveProfile').addEventListener('click', saveProfile);
  document.getElementById('loadProfile').addEventListener('click', () => {
    document.getElementById('profileFile').click();
  });
  document.getElementById('profileFile').addEventListener('change', handleFileSelect);

  const brushToggleBtn = document.getElementById('brushToggle');
  brushToggleBtn.addEventListener('click', function() {
    brushMode = !brushMode;
    this.innerText = brushMode ? "Brush On" : "Brush Off";
  });

  /******************************************
   *            PAN/ZOOM HANDLERS
   ******************************************/
  canvasWrapper.addEventListener('wheel', function(e) {
    e.preventDefault();
    const rect = canvasWrapper.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let zoomFactor = (e.deltaY < 0) ? 1.1 : 0.9;
    const newScale = scale * zoomFactor;
    // Adjust translation so zoom centers on mouse pointer
    translateX = mx - ((mx - translateX) * (newScale / scale));
    translateY = my - ((my - translateY) * (newScale / scale));
    scale = newScale;
    updateCanvasTransform();
    updateAllConnections();
  });

  // Panning: start only if click target is exactly the canvas element.
  canvasWrapper.addEventListener('mousedown', function(e) {
    if (e.target === canvas) {
      isPanning = true;
      panStart.x = e.clientX - translateX;
      panStart.y = e.clientY - translateY;
      canvasWrapper.style.cursor = "grabbing";
    }
  });
  document.addEventListener('mousemove', function(e) {
    if (isPanning) {
      translateX = e.clientX - panStart.x;
      translateY = e.clientY - panStart.y;
      updateCanvasTransform();
      updateAllConnections();
    }
  });
  document.addEventListener('mouseup', function() {
    isPanning = false;
    canvasWrapper.style.cursor = "grab";
  });
  function updateCanvasTransform() {
    canvas.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  }

  /******************************************
   *      DYNAMIC CANVAS SIZE UPDATE
   ******************************************/
  function updateCanvasSize() {
    let maxRight = 0, maxBottom = 0;
    for (const id in boxMap) {
      const box = boxMap[id];
      const left = parseFloat(box.style.left) || 0;
      const top = parseFloat(box.style.top) || 0;
      const width = box.offsetWidth;
      const height = box.offsetHeight;
      if (left + width > maxRight) maxRight = left + width;
      if (top + height > maxBottom) maxBottom = top + height;
    }
    const offset = 100; // extra margin
    canvas.style.width = (maxRight + offset) + "px";
    canvas.style.height = (maxBottom + offset) + "px";
    svg.style.width = canvas.style.width;
    svg.style.height = canvas.style.height;
  }

  function updateAllConnections() {
    const canvasRect = canvas.getBoundingClientRect();
    connections.forEach(conn => {
      const fromBox = boxMap[conn.fromBoxId];
      const toBox = boxMap[conn.toBoxId];
      if (!fromBox || !toBox) return;
      const fromConnector = fromBox.querySelector('.output-connector');
      const toConnector = toBox.querySelector('.input-connector');
      const fromRect = fromConnector.getBoundingClientRect();
      const toRect = toConnector.getBoundingClientRect();
      const fromCenter = getConnectorCenter(fromRect);
      const toCenter = getConnectorCenter(toRect);
      conn.line.setAttribute('x1', fromCenter.x);
      conn.line.setAttribute('y1', fromCenter.y);
      conn.line.setAttribute('x2', toCenter.x);
      conn.line.setAttribute('y2', toCenter.y);
      updateConnectionDeleteButton(conn);
    });
    updateCanvasSize();
  }

  /******************************************
   *          BOX FUNCTIONS
   ******************************************/
  function addBox() {
    const box = document.createElement('div');
    box.classList.add('box');
    box.style.width = '200px';
    box.style.height = '150px';
    box.style.left = '100px';
    box.style.top = '100px';
    box.dataset.id = 'box_' + Date.now();
    const defaultColor = document.getElementById('defaultBoxColor').value;
    box.style.backgroundColor = defaultColor;

    // Drag handle
    const dragHandle = document.createElement('div');
    dragHandle.classList.add('drag-handle');
    box.appendChild(dragHandle);

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.innerText = '×';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBox(box);
    });
    box.appendChild(deleteBtn);

    // Editable content area
    const contentArea = document.createElement('div');
    contentArea.classList.add('box-content');
    contentArea.contentEditable = 'true';
    contentArea.innerText = 'Double-click to edit text...';
    box.appendChild(contentArea);

    // Connectors
    const inputConnector = document.createElement('div');
    inputConnector.classList.add('connector', 'input-connector');
    box.appendChild(inputConnector);

    const outputConnector = document.createElement('div');
    outputConnector.classList.add('connector', 'output-connector');
    box.appendChild(outputConnector);

    // Settings icon
    const settingsIcon = document.createElement('div');
    settingsIcon.classList.add('settings-icon');
    settingsIcon.innerHTML = '&#9881;';
    box.appendChild(settingsIcon);
    settingsIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      openSettings(box);
    });

    // Connection events
    outputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      startConnection(outputConnector);
    });
    inputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      completeConnection(inputConnector);
    });

    // Brush mode: clicking on box (outside controls) changes its background color
    box.addEventListener('click', function(e) {
      if (brushMode &&
          !e.target.classList.contains('connector') &&
          !e.target.classList.contains('settings-icon') &&
          !e.target.classList.contains('delete-btn') &&
          !e.target.classList.contains('drag-handle')) {
        box.style.backgroundColor = document.getElementById('brushColor').value;
      }
    });

    canvas.appendChild(box);
    boxMap[box.dataset.id] = box;
    makeBoxDraggable(box);
    updateCanvasSize();
  }

  function deleteBox(box) {
    const boxId = box.dataset.id;
    connections = connections.filter(conn => {
      if (conn.fromBoxId === boxId || conn.toBoxId === boxId) {
        conn.line.remove();
        if (conn.deleteBtn) conn.deleteBtn.remove();
        return false;
      }
      return true;
    });
    delete boxMap[boxId];
    box.remove();
    updateCanvasSize();
  }

  /******************************************
   *         CONNECTION FUNCTIONS
   ******************************************/
  function startConnection(outputElem) {
    currentConnection = {
      from: outputElem,
      line: document.createElementNS("http://www.w3.org/2000/svg", "line")
    };
    currentConnection.line.setAttribute('stroke', '#fff');
    currentConnection.line.setAttribute('stroke-width', '2');
    svg.appendChild(currentConnection.line);

    document.addEventListener('mousemove', updateTemporaryLine);
    document.addEventListener('click', cancelConnection);
  }

  function updateTemporaryLine(e) {
    if (!currentConnection) return;
    const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
    const fromRect = currentConnection.from.getBoundingClientRect();
    const fromCenter = getConnectorCenter(fromRect);
    currentConnection.line.setAttribute('x1', fromCenter.x);
    currentConnection.line.setAttribute('y1', fromCenter.y);
    currentConnection.line.setAttribute('x2', mouseX);
    currentConnection.line.setAttribute('y2', mouseY);
  }

  function completeConnection(inputElem) {
    if (!currentConnection) return;
    const toRect = inputElem.getBoundingClientRect();
    const toCenter = getConnectorCenter(toRect);
    currentConnection.line.setAttribute('x2', toCenter.x);
    currentConnection.line.setAttribute('y2', toCenter.y);
    const fromBoxId = currentConnection.from.parentElement.dataset.id;
    const toBoxId = inputElem.parentElement.dataset.id;
    let conn = {
      fromBoxId,
      toBoxId,
      line: currentConnection.line,
      deleteBtn: null
    };
    connections.push(conn);
    createConnectionDeleteButton(conn);

    document.removeEventListener('mousemove', updateTemporaryLine);
    document.removeEventListener('click', cancelConnection);
    currentConnection = null;
    updateAllConnections();
  }

  function cancelConnection() {
    if (currentConnection) {
      currentConnection.line.remove();
      document.removeEventListener('mousemove', updateTemporaryLine);
      document.removeEventListener('click', cancelConnection);
      currentConnection = null;
    }
  }

  function createConnectionDeleteButton(conn) {
    const btn = document.createElement('button');
    btn.classList.add('connection-delete-btn');
    btn.innerText = '×';
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      deleteConnection(conn);
    });
    canvas.appendChild(btn);
    conn.deleteBtn = btn;
    updateConnectionDeleteButton(conn);
  }

  function deleteConnection(conn) {
    conn.line.remove();
    if (conn.deleteBtn) conn.deleteBtn.remove();
    connections = connections.filter(c => c !== conn);
  }

  function updateConnectionDeleteButton(conn) {
    const x1 = parseFloat(conn.line.getAttribute('x1'));
    const y1 = parseFloat(conn.line.getAttribute('y1'));
    const x2 = parseFloat(conn.line.getAttribute('x2'));
    const y2 = parseFloat(conn.line.getAttribute('y2'));
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;
    conn.deleteBtn.style.left = (centerX - 10) + 'px';
    conn.deleteBtn.style.top = (centerY - 10) + 'px';
  }

  /******************************************
   *         HELPER FUNCTIONS
   ******************************************/
  function getConnectorCenter(rect) {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return screenToCanvas(centerX, centerY);
  }

  function screenToCanvas(screenX, screenY) {
    const wrapperRect = canvasWrapper.getBoundingClientRect();
    const x = (screenX - wrapperRect.left - translateX) / scale;
    const y = (screenY - wrapperRect.top - translateY) / scale;
    return { x, y };
  }

  /******************************************
   *         DRAGGABLE BOXES
   ******************************************/
  function makeBoxDraggable(box) {
    const dragHandle = box.querySelector('.drag-handle');
    let offsetX, offsetY;
    let isDragging = false;
    dragHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      const boxRect = box.getBoundingClientRect();
      const { x: boxX, y: boxY } = screenToCanvas(boxRect.left, boxRect.top);
      const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
      offsetX = mouseX - boxX;
      offsetY = mouseY - boxY;
      document.addEventListener('mousemove', dragMouseMove);
      document.addEventListener('mouseup', dragMouseUp);
    });
    function dragMouseMove(e) {
      if (!isDragging) return;
      const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
      const newLeft = mouseX - offsetX;
      const newTop = mouseY - offsetY;
      box.style.left = newLeft + 'px';
      box.style.top = newTop + 'px';
      updateAllConnections();
    }
    function dragMouseUp() {
      isDragging = false;
      document.removeEventListener('mousemove', dragMouseMove);
      document.removeEventListener('mouseup', dragMouseUp);
      updateAllConnections();
    }
  }

  /******************************************
   *       BOX SETTINGS: CHANGE COLOR
   ******************************************/
  function openSettings(box) {
    let colorInput = box.querySelector('.color-input');
    if (!colorInput) {
      colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.classList.add('color-input');
      colorInput.style.position = 'absolute';
      colorInput.style.top = '30px';
      colorInput.style.right = '2px';
      box.appendChild(colorInput);
      colorInput.addEventListener('input', (e) => {
        box.style.backgroundColor = e.target.value;
      });
      colorInput.addEventListener('blur', () => {
        colorInput.remove();
      });
      colorInput.focus();
    }
  }

  /******************************************
   *       PROFILE FUNCTIONS: NEW, SAVE, LOAD
   ******************************************/
  function newProfile() {
    clearCanvas();
  }

  function saveProfile() {
    const state = gatherState();
    let filename = prompt("Enter filename for profile (without extension):", "profile_" + Date.now());
    if (!filename) {
      filename = "profile_" + Date.now();
    }
    const blob = new Blob([JSON.stringify(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const state = JSON.parse(e.target.result);
        clearCanvas();
        state.boxes.forEach(boxState => {
          createBoxFromState(boxState);
        });
        state.connections.forEach(connState => {
          const fromBox = boxMap[connState.fromBoxId];
          const toBox = boxMap[connState.toBoxId];
          if (fromBox && toBox) {
            createConnection(fromBox, toBox);
          }
        });
      } catch(err) {
        alert("Error loading profile: " + err);
      }
    };
    reader.readAsText(file);
  }

  function gatherState() {
    const boxes = [];
    for (const boxId in boxMap) {
      const box = boxMap[boxId];
      boxes.push({
        id: boxId,
        left: parseFloat(box.style.left),
        top: parseFloat(box.style.top),
        width: parseFloat(box.style.width),
        height: parseFloat(box.style.height),
        backgroundColor: box.style.backgroundColor,
        text: box.querySelector('.box-content').innerText
      });
    }
    const savedConnections = connections.map(conn => ({
      fromBoxId: conn.fromBoxId,
      toBoxId: conn.toBoxId
    }));
    return { boxes, connections: savedConnections };
  }

  function clearCanvas() {
    canvas.querySelectorAll('.box').forEach(box => box.remove());
    svg.innerHTML = '';
    document.querySelectorAll('.connection-delete-btn').forEach(btn => btn.remove());
    connections = [];
    boxMap = {};
    updateCanvasSize();
  }

  function createBoxFromState(boxState) {
    const box = document.createElement('div');
    box.classList.add('box');
    box.style.width = boxState.width + 'px';
    box.style.height = boxState.height + 'px';
    box.style.left = boxState.left + 'px';
    box.style.top = boxState.top + 'px';
    box.style.backgroundColor = boxState.backgroundColor;
    box.dataset.id = boxState.id;

    const dragHandle = document.createElement('div');
    dragHandle.classList.add('drag-handle');
    box.appendChild(dragHandle);

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.innerText = '×';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBox(box);
    });
    box.appendChild(deleteBtn);

    const contentArea = document.createElement('div');
    contentArea.classList.add('box-content');
    contentArea.contentEditable = 'true';
    contentArea.innerText = boxState.text;
    box.appendChild(contentArea);

    const inputConnector = document.createElement('div');
    inputConnector.classList.add('connector', 'input-connector');
    box.appendChild(inputConnector);

    const outputConnector = document.createElement('div');
    outputConnector.classList.add('connector', 'output-connector');
    box.appendChild(outputConnector);

    const settingsIcon = document.createElement('div');
    settingsIcon.classList.add('settings-icon');
    settingsIcon.innerHTML = '&#9881;';
    box.appendChild(settingsIcon);
    settingsIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      openSettings(box);
    });

    outputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      startConnection(outputConnector);
    });
    inputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      completeConnection(inputConnector);
    });

    box.addEventListener('click', function(e) {
      if (brushMode &&
          !e.target.classList.contains('connector') &&
          !e.target.classList.contains('settings-icon') &&
          !e.target.classList.contains('delete-btn') &&
          !e.target.classList.contains('drag-handle')) {
        box.style.backgroundColor = document.getElementById('brushColor').value;
      }
    });

    canvas.appendChild(box);
    boxMap[box.dataset.id] = box;
    makeBoxDraggable(box);
    updateCanvasSize();
  }

  /******************************************
   *       DRAGGABLE BOXES
   ******************************************/
  function makeBoxDraggable(box) {
    const dragHandle = box.querySelector('.drag-handle');
    let offsetX, offsetY;
    let isDragging = false;
    dragHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      const boxRect = box.getBoundingClientRect();
      const { x: boxX, y: boxY } = screenToCanvas(boxRect.left, boxRect.top);
      const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
      offsetX = mouseX - boxX;
      offsetY = mouseY - boxY;
      document.addEventListener('mousemove', dragMouseMove);
      document.addEventListener('mouseup', dragMouseUp);
    });
    function dragMouseMove(e) {
      if (!isDragging) return;
      const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
      const newLeft = mouseX - offsetX;
      const newTop = mouseY - offsetY;
      box.style.left = newLeft + 'px';
      box.style.top = newTop + 'px';
      updateAllConnections();
    }
    function dragMouseUp() {
      isDragging = false;
      document.removeEventListener('mousemove', dragMouseMove);
      document.removeEventListener('mouseup', dragMouseUp);
      updateAllConnections();
    }
  }

  /******************************************
   *       BOX SETTINGS: CHANGE COLOR
   ******************************************/
  function openSettings(box) {
    let colorInput = box.querySelector('.color-input');
    if (!colorInput) {
      colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.classList.add('color-input');
      colorInput.style.position = 'absolute';
      colorInput.style.top = '30px';
      colorInput.style.right = '2px';
      box.appendChild(colorInput);
      colorInput.addEventListener('input', (e) => {
        box.style.backgroundColor = e.target.value;
      });
      colorInput.addEventListener('blur', () => {
        colorInput.remove();
      });
      colorInput.focus();
    }
  }

  /******************************************
   *       PROFILE FUNCTIONS: NEW, SAVE, LOAD
   ******************************************/
  function newProfile() {
    clearCanvas();
  }

  function saveProfile() {
    const state = gatherState();
    let filename = prompt("Enter filename for profile (without extension):", "profile_" + Date.now());
    if (!filename) {
      filename = "profile_" + Date.now();
    }
    const blob = new Blob([JSON.stringify(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const state = JSON.parse(e.target.result);
        clearCanvas();
        state.boxes.forEach(boxState => {
          createBoxFromState(boxState);
        });
        state.connections.forEach(connState => {
          const fromBox = boxMap[connState.fromBoxId];
          const toBox = boxMap[connState.toBoxId];
          if (fromBox && toBox) {
            createConnection(fromBox, toBox);
          }
        });
      } catch(err) {
        alert("Error loading profile: " + err);
      }
    };
    reader.readAsText(file);
  }

  function gatherState() {
    const boxes = [];
    for (const boxId in boxMap) {
      const box = boxMap[boxId];
      boxes.push({
        id: boxId,
        left: parseFloat(box.style.left),
        top: parseFloat(box.style.top),
        width: parseFloat(box.style.width),
        height: parseFloat(box.style.height),
        backgroundColor: box.style.backgroundColor,
        text: box.querySelector('.box-content').innerText
      });
    }
    const savedConnections = connections.map(conn => ({
      fromBoxId: conn.fromBoxId,
      toBoxId: conn.toBoxId
    }));
    return { boxes, connections: savedConnections };
  }

  function clearCanvas() {
    canvas.querySelectorAll('.box').forEach(box => box.remove());
    svg.innerHTML = '';
    document.querySelectorAll('.connection-delete-btn').forEach(btn => btn.remove());
    connections = [];
    boxMap = {};
    updateCanvasSize();
  }

  function createBoxFromState(boxState) {
    const box = document.createElement('div');
    box.classList.add('box');
    box.style.width = boxState.width + 'px';
    box.style.height = boxState.height + 'px';
    box.style.left = boxState.left + 'px';
    box.style.top = boxState.top + 'px';
    box.style.backgroundColor = boxState.backgroundColor;
    box.dataset.id = boxState.id;

    const dragHandle = document.createElement('div');
    dragHandle.classList.add('drag-handle');
    box.appendChild(dragHandle);

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.innerText = '×';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBox(box);
    });
    box.appendChild(deleteBtn);

    const contentArea = document.createElement('div');
    contentArea.classList.add('box-content');
    contentArea.contentEditable = 'true';
    contentArea.innerText = boxState.text;
    box.appendChild(contentArea);

    const inputConnector = document.createElement('div');
    inputConnector.classList.add('connector', 'input-connector');
    box.appendChild(inputConnector);

    const outputConnector = document.createElement('div');
    outputConnector.classList.add('connector', 'output-connector');
    box.appendChild(outputConnector);

    const settingsIcon = document.createElement('div');
    settingsIcon.classList.add('settings-icon');
    settingsIcon.innerHTML = '&#9881;';
    box.appendChild(settingsIcon);
    settingsIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      openSettings(box);
    });

    outputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      startConnection(outputConnector);
    });
    inputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      completeConnection(inputConnector);
    });

    box.addEventListener('click', function(e) {
      if (brushMode &&
          !e.target.classList.contains('connector') &&
          !e.target.classList.contains('settings-icon') &&
          !e.target.classList.contains('delete-btn') &&
          !e.target.classList.contains('drag-handle')) {
        box.style.backgroundColor = document.getElementById('brushColor').value;
      }
    });

    canvas.appendChild(box);
    boxMap[box.dataset.id] = box;
    makeBoxDraggable(box);
    updateCanvasSize();
  }

  /******************************************
   *         DRAGGABLE BOXES
   ******************************************/
  function makeBoxDraggable(box) {
    const dragHandle = box.querySelector('.drag-handle');
    let offsetX, offsetY;
    let isDragging = false;
    dragHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      const boxRect = box.getBoundingClientRect();
      const { x: boxX, y: boxY } = screenToCanvas(boxRect.left, boxRect.top);
      const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
      offsetX = mouseX - boxX;
      offsetY = mouseY - boxY;
      document.addEventListener('mousemove', dragMouseMove);
      document.addEventListener('mouseup', dragMouseUp);
    });
    function dragMouseMove(e) {
      if (!isDragging) return;
      const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
      const newLeft = mouseX - offsetX;
      const newTop = mouseY - offsetY;
      box.style.left = newLeft + 'px';
      box.style.top = newTop + 'px';
      updateAllConnections();
    }
    function dragMouseUp() {
      isDragging = false;
      document.removeEventListener('mousemove', dragMouseMove);
      document.removeEventListener('mouseup', dragMouseUp);
      updateAllConnections();
    }
  }

  /******************************************
   *       BOX SETTINGS: CHANGE COLOR
   ******************************************/
  function openSettings(box) {
    let colorInput = box.querySelector('.color-input');
    if (!colorInput) {
      colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.classList.add('color-input');
      colorInput.style.position = 'absolute';
      colorInput.style.top = '30px';
      colorInput.style.right = '2px';
      box.appendChild(colorInput);
      colorInput.addEventListener('input', (e) => {
        box.style.backgroundColor = e.target.value;
      });
      colorInput.addEventListener('blur', () => {
        colorInput.remove();
      });
      colorInput.focus();
    }
  }

  /******************************************
   *       PROFILE FUNCTIONS: NEW, SAVE, LOAD
   ******************************************/
  function newProfile() {
    clearCanvas();
  }

  function saveProfile() {
    const state = gatherState();
    let filename = prompt("Enter filename for profile (without extension):", "profile_" + Date.now());
    if (!filename) {
      filename = "profile_" + Date.now();
    }
    const blob = new Blob([JSON.stringify(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const state = JSON.parse(e.target.result);
        clearCanvas();
        state.boxes.forEach(boxState => {
          createBoxFromState(boxState);
        });
        state.connections.forEach(connState => {
          const fromBox = boxMap[connState.fromBoxId];
          const toBox = boxMap[connState.toBoxId];
          if (fromBox && toBox) {
            createConnection(fromBox, toBox);
          }
        });
      } catch(err) {
        alert("Error loading profile: " + err);
      }
    };
    reader.readAsText(file);
  }

  function gatherState() {
    const boxes = [];
    for (const boxId in boxMap) {
      const box = boxMap[boxId];
      boxes.push({
        id: boxId,
        left: parseFloat(box.style.left),
        top: parseFloat(box.style.top),
        width: parseFloat(box.style.width),
        height: parseFloat(box.style.height),
        backgroundColor: box.style.backgroundColor,
        text: box.querySelector('.box-content').innerText
      });
    }
    const savedConnections = connections.map(conn => ({
      fromBoxId: conn.fromBoxId,
      toBoxId: conn.toBoxId
    }));
    return { boxes, connections: savedConnections };
  }

  function clearCanvas() {
    canvas.querySelectorAll('.box').forEach(box => box.remove());
    svg.innerHTML = '';
    document.querySelectorAll('.connection-delete-btn').forEach(btn => btn.remove());
    connections = [];
    boxMap = {};
    updateCanvasSize();
  }

  function createBoxFromState(boxState) {
    const box = document.createElement('div');
    box.classList.add('box');
    box.style.width = boxState.width + 'px';
    box.style.height = boxState.height + 'px';
    box.style.left = boxState.left + 'px';
    box.style.top = boxState.top + 'px';
    box.style.backgroundColor = boxState.backgroundColor;
    box.dataset.id = boxState.id;

    const dragHandle = document.createElement('div');
    dragHandle.classList.add('drag-handle');
    box.appendChild(dragHandle);

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.innerText = '×';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBox(box);
    });
    box.appendChild(deleteBtn);

    const contentArea = document.createElement('div');
    contentArea.classList.add('box-content');
    contentArea.contentEditable = 'true';
    contentArea.innerText = boxState.text;
    box.appendChild(contentArea);

    const inputConnector = document.createElement('div');
    inputConnector.classList.add('connector', 'input-connector');
    box.appendChild(inputConnector);

    const outputConnector = document.createElement('div');
    outputConnector.classList.add('connector', 'output-connector');
    box.appendChild(outputConnector);

    const settingsIcon = document.createElement('div');
    settingsIcon.classList.add('settings-icon');
    settingsIcon.innerHTML = '&#9881;';
    box.appendChild(settingsIcon);
    settingsIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      openSettings(box);
    });

    outputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      startConnection(outputConnector);
    });
    inputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      completeConnection(inputConnector);
    });

    box.addEventListener('click', function(e) {
      if (brushMode &&
          !e.target.classList.contains('connector') &&
          !e.target.classList.contains('settings-icon') &&
          !e.target.classList.contains('delete-btn') &&
          !e.target.classList.contains('drag-handle')) {
        box.style.backgroundColor = document.getElementById('brushColor').value;
      }
    });

    canvas.appendChild(box);
    boxMap[box.dataset.id] = box;
    makeBoxDraggable(box);
    updateCanvasSize();
  }

  /******************************************
   *         DRAGGABLE BOXES
   ******************************************/
  function makeBoxDraggable(box) {
    const dragHandle = box.querySelector('.drag-handle');
    let offsetX, offsetY;
    let isDragging = false;
    dragHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      const boxRect = box.getBoundingClientRect();
      const { x: boxX, y: boxY } = screenToCanvas(boxRect.left, boxRect.top);
      const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
      offsetX = mouseX - boxX;
      offsetY = mouseY - boxY;
      document.addEventListener('mousemove', dragMouseMove);
      document.addEventListener('mouseup', dragMouseUp);
    });
    function dragMouseMove(e) {
      if (!isDragging) return;
      const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
      const newLeft = mouseX - offsetX;
      const newTop = mouseY - offsetY;
      box.style.left = newLeft + 'px';
      box.style.top = newTop + 'px';
      updateAllConnections();
    }
    function dragMouseUp() {
      isDragging = false;
      document.removeEventListener('mousemove', dragMouseMove);
      document.removeEventListener('mouseup', dragMouseUp);
      updateAllConnections();
    }
  }

  /******************************************
   *       BOX SETTINGS: CHANGE COLOR
   ******************************************/
  function openSettings(box) {
    let colorInput = box.querySelector('.color-input');
    if (!colorInput) {
      colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.classList.add('color-input');
      colorInput.style.position = 'absolute';
      colorInput.style.top = '30px';
      colorInput.style.right = '2px';
      box.appendChild(colorInput);
      colorInput.addEventListener('input', (e) => {
        box.style.backgroundColor = e.target.value;
      });
      colorInput.addEventListener('blur', () => {
        colorInput.remove();
      });
      colorInput.focus();
    }
  }

  /******************************************
   *       PROFILE FUNCTIONS: NEW, SAVE, LOAD
   ******************************************/
  function newProfile() {
    clearCanvas();
  }

  function saveProfile() {
    const state = gatherState();
    let filename = prompt("Enter filename for profile (without extension):", "profile_" + Date.now());
    if (!filename) {
      filename = "profile_" + Date.now();
    }
    const blob = new Blob([JSON.stringify(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const state = JSON.parse(e.target.result);
        clearCanvas();
        state.boxes.forEach(boxState => {
          createBoxFromState(boxState);
        });
        state.connections.forEach(connState => {
          const fromBox = boxMap[connState.fromBoxId];
          const toBox = boxMap[connState.toBoxId];
          if (fromBox && toBox) {
            createConnection(fromBox, toBox);
          }
        });
      } catch(err) {
        alert("Error loading profile: " + err);
      }
    };
    reader.readAsText(file);
  }

  function gatherState() {
    const boxes = [];
    for (const boxId in boxMap) {
      const box = boxMap[boxId];
      boxes.push({
        id: boxId,
        left: parseFloat(box.style.left),
        top: parseFloat(box.style.top),
        width: parseFloat(box.style.width),
        height: parseFloat(box.style.height),
        backgroundColor: box.style.backgroundColor,
        text: box.querySelector('.box-content').innerText
      });
    }
    const savedConnections = connections.map(conn => ({
      fromBoxId: conn.fromBoxId,
      toBoxId: conn.toBoxId
    }));
    return { boxes, connections: savedConnections };
  }

  function clearCanvas() {
    canvas.querySelectorAll('.box').forEach(box => box.remove());
    svg.innerHTML = '';
    document.querySelectorAll('.connection-delete-btn').forEach(btn => btn.remove());
    connections = [];
    boxMap = {};
    updateCanvasSize();
  }

  function createBoxFromState(boxState) {
    const box = document.createElement('div');
    box.classList.add('box');
    box.style.width = boxState.width + 'px';
    box.style.height = boxState.height + 'px';
    box.style.left = boxState.left + 'px';
    box.style.top = boxState.top + 'px';
    box.style.backgroundColor = boxState.backgroundColor;
    box.dataset.id = boxState.id;

    const dragHandle = document.createElement('div');
    dragHandle.classList.add('drag-handle');
    box.appendChild(dragHandle);

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.innerText = '×';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBox(box);
    });
    box.appendChild(deleteBtn);

    const contentArea = document.createElement('div');
    contentArea.classList.add('box-content');
    contentArea.contentEditable = 'true';
    contentArea.innerText = boxState.text;
    box.appendChild(contentArea);

    const inputConnector = document.createElement('div');
    inputConnector.classList.add('connector', 'input-connector');
    box.appendChild(inputConnector);

    const outputConnector = document.createElement('div');
    outputConnector.classList.add('connector', 'output-connector');
    box.appendChild(outputConnector);

    const settingsIcon = document.createElement('div');
    settingsIcon.classList.add('settings-icon');
    settingsIcon.innerHTML = '&#9881;';
    box.appendChild(settingsIcon);
    settingsIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      openSettings(box);
    });

    outputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      startConnection(outputConnector);
    });
    inputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      completeConnection(inputConnector);
    });

    box.addEventListener('click', function(e) {
      if (brushMode &&
          !e.target.classList.contains('connector') &&
          !e.target.classList.contains('settings-icon') &&
          !e.target.classList.contains('delete-btn') &&
          !e.target.classList.contains('drag-handle')) {
        box.style.backgroundColor = document.getElementById('brushColor').value;
      }
    });

    canvas.appendChild(box);
    boxMap[box.dataset.id] = box;
    makeBoxDraggable(box);
    updateCanvasSize();
  }

  /******************************************
   *         DRAGGABLE BOXES
   ******************************************/
  function makeBoxDraggable(box) {
    const dragHandle = box.querySelector('.drag-handle');
    let offsetX, offsetY;
    let isDragging = false;
    dragHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      const boxRect = box.getBoundingClientRect();
      const { x: boxX, y: boxY } = screenToCanvas(boxRect.left, boxRect.top);
      const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
      offsetX = mouseX - boxX;
      offsetY = mouseY - boxY;
      document.addEventListener('mousemove', dragMouseMove);
      document.addEventListener('mouseup', dragMouseUp);
    });
    function dragMouseMove(e) {
      if (!isDragging) return;
      const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
      const newLeft = mouseX - offsetX;
      const newTop = mouseY - offsetY;
      box.style.left = newLeft + 'px';
      box.style.top = newTop + 'px';
      updateAllConnections();
    }
    function dragMouseUp() {
      isDragging = false;
      document.removeEventListener('mousemove', dragMouseMove);
      document.removeEventListener('mouseup', dragMouseUp);
      updateAllConnections();
    }
  }

  /******************************************
   *       BOX SETTINGS: CHANGE COLOR
   ******************************************/
  function openSettings(box) {
    let colorInput = box.querySelector('.color-input');
    if (!colorInput) {
      colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.classList.add('color-input');
      colorInput.style.position = 'absolute';
      colorInput.style.top = '30px';
      colorInput.style.right = '2px';
      box.appendChild(colorInput);
      colorInput.addEventListener('input', (e) => {
        box.style.backgroundColor = e.target.value;
      });
      colorInput.addEventListener('blur', () => {
        colorInput.remove();
      });
      colorInput.focus();
    }
  }

  /******************************************
   *       PROFILE FUNCTIONS: NEW, SAVE, LOAD
   ******************************************/
  function newProfile() {
    clearCanvas();
  }

  function saveProfile() {
    const state = gatherState();
    let filename = prompt("Enter filename for profile (without extension):", "profile_" + Date.now());
    if (!filename) {
      filename = "profile_" + Date.now();
    }
    const blob = new Blob([JSON.stringify(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const state = JSON.parse(e.target.result);
        clearCanvas();
        state.boxes.forEach(boxState => {
          createBoxFromState(boxState);
        });
        state.connections.forEach(connState => {
          const fromBox = boxMap[connState.fromBoxId];
          const toBox = boxMap[connState.toBoxId];
          if (fromBox && toBox) {
            createConnection(fromBox, toBox);
          }
        });
      } catch(err) {
        alert("Error loading profile: " + err);
      }
    };
    reader.readAsText(file);
  }

  function gatherState() {
    const boxes = [];
    for (const boxId in boxMap) {
      const box = boxMap[boxId];
      boxes.push({
        id: boxId,
        left: parseFloat(box.style.left),
        top: parseFloat(box.style.top),
        width: parseFloat(box.style.width),
        height: parseFloat(box.style.height),
        backgroundColor: box.style.backgroundColor,
        text: box.querySelector('.box-content').innerText
      });
    }
    const savedConnections = connections.map(conn => ({
      fromBoxId: conn.fromBoxId,
      toBoxId: conn.toBoxId
    }));
    return { boxes, connections: savedConnections };
  }

  function clearCanvas() {
    canvas.querySelectorAll('.box').forEach(box => box.remove());
    svg.innerHTML = '';
    document.querySelectorAll('.connection-delete-btn').forEach(btn => btn.remove());
    connections = [];
    boxMap = {};
    updateCanvasSize();
  }

  function createBoxFromState(boxState) {
    const box = document.createElement('div');
    box.classList.add('box');
    box.style.width = boxState.width + 'px';
    box.style.height = boxState.height + 'px';
    box.style.left = boxState.left + 'px';
    box.style.top = boxState.top + 'px';
    box.style.backgroundColor = boxState.backgroundColor;
    box.dataset.id = boxState.id;

    const dragHandle = document.createElement('div');
    dragHandle.classList.add('drag-handle');
    box.appendChild(dragHandle);

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.innerText = '×';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBox(box);
    });
    box.appendChild(deleteBtn);

    const contentArea = document.createElement('div');
    contentArea.classList.add('box-content');
    contentArea.contentEditable = 'true';
    contentArea.innerText = boxState.text;
    box.appendChild(contentArea);

    const inputConnector = document.createElement('div');
    inputConnector.classList.add('connector', 'input-connector');
    box.appendChild(inputConnector);

    const outputConnector = document.createElement('div');
    outputConnector.classList.add('connector', 'output-connector');
    box.appendChild(outputConnector);

    const settingsIcon = document.createElement('div');
    settingsIcon.classList.add('settings-icon');
    settingsIcon.innerHTML = '&#9881;';
    box.appendChild(settingsIcon);
    settingsIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      openSettings(box);
    });

    outputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      startConnection(outputConnector);
    });
    inputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      completeConnection(inputConnector);
    });

    box.addEventListener('click', function(e) {
      if (brushMode &&
          !e.target.classList.contains('connector') &&
          !e.target.classList.contains('settings-icon') &&
          !e.target.classList.contains('delete-btn') &&
          !e.target.classList.contains('drag-handle')) {
        box.style.backgroundColor = document.getElementById('brushColor').value;
      }
    });

    canvas.appendChild(box);
    boxMap[box.dataset.id] = box;
    makeBoxDraggable(box);
    updateCanvasSize();
  }

  /******************************************
   *         DRAGGABLE BOXES
   ******************************************/
  function makeBoxDraggable(box) {
    const dragHandle = box.querySelector('.drag-handle');
    let offsetX, offsetY;
    let isDragging = false;
    dragHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      const boxRect = box.getBoundingClientRect();
      const { x: boxX, y: boxY } = screenToCanvas(boxRect.left, boxRect.top);
      const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
      offsetX = mouseX - boxX;
      offsetY = mouseY - boxY;
      document.addEventListener('mousemove', dragMouseMove);
      document.addEventListener('mouseup', dragMouseUp);
    });
    function dragMouseMove(e) {
      if (!isDragging) return;
      const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
      const newLeft = mouseX - offsetX;
      const newTop = mouseY - offsetY;
      box.style.left = newLeft + 'px';
      box.style.top = newTop + 'px';
      updateAllConnections();
    }
    function dragMouseUp() {
      isDragging = false;
      document.removeEventListener('mousemove', dragMouseMove);
      document.removeEventListener('mouseup', dragMouseUp);
      updateAllConnections();
    }
  }

  /******************************************
   *       BOX SETTINGS: CHANGE COLOR
   ******************************************/
  function openSettings(box) {
    let colorInput = box.querySelector('.color-input');
    if (!colorInput) {
      colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.classList.add('color-input');
      colorInput.style.position = 'absolute';
      colorInput.style.top = '30px';
      colorInput.style.right = '2px';
      box.appendChild(colorInput);
      colorInput.addEventListener('input', (e) => {
        box.style.backgroundColor = e.target.value;
      });
      colorInput.addEventListener('blur', () => {
        colorInput.remove();
      });
      colorInput.focus();
    }
  }

  /******************************************
   *       PROFILE FUNCTIONS: NEW, SAVE, LOAD
   ******************************************/
  function newProfile() {
    clearCanvas();
  }

  function saveProfile() {
    const state = gatherState();
    let filename = prompt("Enter filename for profile (without extension):", "profile_" + Date.now());
    if (!filename) {
      filename = "profile_" + Date.now();
    }
    const blob = new Blob([JSON.stringify(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const state = JSON.parse(e.target.result);
        clearCanvas();
        state.boxes.forEach(boxState => {
          createBoxFromState(boxState);
        });
        state.connections.forEach(connState => {
          const fromBox = boxMap[connState.fromBoxId];
          const toBox = boxMap[connState.toBoxId];
          if (fromBox && toBox) {
            createConnection(fromBox, toBox);
          }
        });
      } catch(err) {
        alert("Error loading profile: " + err);
      }
    };
    reader.readAsText(file);
  }

  function gatherState() {
    const boxes = [];
    for (const boxId in boxMap) {
      const box = boxMap[boxId];
      boxes.push({
        id: boxId,
        left: parseFloat(box.style.left),
        top: parseFloat(box.style.top),
        width: parseFloat(box.style.width),
        height: parseFloat(box.style.height),
        backgroundColor: box.style.backgroundColor,
        text: box.querySelector('.box-content').innerText
      });
    }
    const savedConnections = connections.map(conn => ({
      fromBoxId: conn.fromBoxId,
      toBoxId: conn.toBoxId
    }));
    return { boxes, connections: savedConnections };
  }

  function clearCanvas() {
    canvas.querySelectorAll('.box').forEach(box => box.remove());
    svg.innerHTML = '';
    document.querySelectorAll('.connection-delete-btn').forEach(btn => btn.remove());
    connections = [];
    boxMap = {};
    updateCanvasSize();
  }

  function createBoxFromState(boxState) {
    const box = document.createElement('div');
    box.classList.add('box');
    box.style.width = boxState.width + 'px';
    box.style.height = boxState.height + 'px';
    box.style.left = boxState.left + 'px';
    box.style.top = boxState.top + 'px';
    box.style.backgroundColor = boxState.backgroundColor;
    box.dataset.id = boxState.id;

    const dragHandle = document.createElement('div');
    dragHandle.classList.add('drag-handle');
    box.appendChild(dragHandle);

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.innerText = '×';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBox(box);
    });
    box.appendChild(deleteBtn);

    const contentArea = document.createElement('div');
    contentArea.classList.add('box-content');
    contentArea.contentEditable = 'true';
    contentArea.innerText = boxState.text;
    box.appendChild(contentArea);

    const inputConnector = document.createElement('div');
    inputConnector.classList.add('connector', 'input-connector');
    box.appendChild(inputConnector);

    const outputConnector = document.createElement('div');
    outputConnector.classList.add('connector', 'output-connector');
    box.appendChild(outputConnector);

    const settingsIcon = document.createElement('div');
    settingsIcon.classList.add('settings-icon');
    settingsIcon.innerHTML = '&#9881;';
    box.appendChild(settingsIcon);
    settingsIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      openSettings(box);
    });

    outputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      startConnection(outputConnector);
    });
    inputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      completeConnection(inputConnector);
    });

    box.addEventListener('click', function(e) {
      if (brushMode &&
          !e.target.classList.contains('connector') &&
          !e.target.classList.contains('settings-icon') &&
          !e.target.classList.contains('delete-btn') &&
          !e.target.classList.contains('drag-handle')) {
        box.style.backgroundColor = document.getElementById('brushColor').value;
      }
    });

    canvas.appendChild(box);
    boxMap[box.dataset.id] = box;
    makeBoxDraggable(box);
    updateCanvasSize();
  }

  /******************************************
   *         DRAGGABLE BOXES
   ******************************************/
  function makeBoxDraggable(box) {
    const dragHandle = box.querySelector('.drag-handle');
    let offsetX, offsetY;
    let isDragging = false;
    dragHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      const boxRect = box.getBoundingClientRect();
      const { x: boxX, y: boxY } = screenToCanvas(boxRect.left, boxRect.top);
      const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
      offsetX = mouseX - boxX;
      offsetY = mouseY - boxY;
      document.addEventListener('mousemove', dragMouseMove);
      document.addEventListener('mouseup', dragMouseUp);
    });
    function dragMouseMove(e) {
      if (!isDragging) return;
      const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
      const newLeft = mouseX - offsetX;
      const newTop = mouseY - offsetY;
      box.style.left = newLeft + 'px';
      box.style.top = newTop + 'px';
      updateAllConnections();
    }
    function dragMouseUp() {
      isDragging = false;
      document.removeEventListener('mousemove', dragMouseMove);
      document.removeEventListener('mouseup', dragMouseUp);
      updateAllConnections();
    }
  }

  /******************************************
   *       BOX SETTINGS: CHANGE COLOR
   ******************************************/
  function openSettings(box) {
    let colorInput = box.querySelector('.color-input');
    if (!colorInput) {
      colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.classList.add('color-input');
      colorInput.style.position = 'absolute';
      colorInput.style.top = '30px';
      colorInput.style.right = '2px';
      box.appendChild(colorInput);
      colorInput.addEventListener('input', (e) => {
        box.style.backgroundColor = e.target.value;
      });
      colorInput.addEventListener('blur', () => {
        colorInput.remove();
      });
      colorInput.focus();
    }
  }

  /******************************************
   *       PROFILE FUNCTIONS: NEW, SAVE, LOAD
   ******************************************/
  function newProfile() {
    clearCanvas();
  }

  function saveProfile() {
    const state = gatherState();
    let filename = prompt("Enter filename for profile (without extension):", "profile_" + Date.now());
    if (!filename) {
      filename = "profile_" + Date.now();
    }
    const blob = new Blob([JSON.stringify(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const state = JSON.parse(e.target.result);
        clearCanvas();
        state.boxes.forEach(boxState => {
          createBoxFromState(boxState);
        });
        state.connections.forEach(connState => {
          const fromBox = boxMap[connState.fromBoxId];
          const toBox = boxMap[connState.toBoxId];
          if (fromBox && toBox) {
            createConnection(fromBox, toBox);
          }
        });
      } catch(err) {
        alert("Error loading profile: " + err);
      }
    };
    reader.readAsText(file);
  }

  function gatherState() {
    const boxes = [];
    for (const boxId in boxMap) {
      const box = boxMap[boxId];
      boxes.push({
        id: boxId,
        left: parseFloat(box.style.left),
        top: parseFloat(box.style.top),
        width: parseFloat(box.style.width),
        height: parseFloat(box.style.height),
        backgroundColor: box.style.backgroundColor,
        text: box.querySelector('.box-content').innerText
      });
    }
    const savedConnections = connections.map(conn => ({
      fromBoxId: conn.fromBoxId,
      toBoxId: conn.toBoxId
    }));
    return { boxes, connections: savedConnections };
  }

  function clearCanvas() {
    canvas.querySelectorAll('.box').forEach(box => box.remove());
    svg.innerHTML = '';
    document.querySelectorAll('.connection-delete-btn').forEach(btn => btn.remove());
    connections = [];
    boxMap = {};
    updateCanvasSize();
  }

  function createBoxFromState(boxState) {
    const box = document.createElement('div');
    box.classList.add('box');
    box.style.width = boxState.width + 'px';
    box.style.height = boxState.height + 'px';
    box.style.left = boxState.left + 'px';
    box.style.top = boxState.top + 'px';
    box.style.backgroundColor = boxState.backgroundColor;
    box.dataset.id = boxState.id;

    const dragHandle = document.createElement('div');
    dragHandle.classList.add('drag-handle');
    box.appendChild(dragHandle);

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.innerText = '×';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBox(box);
    });
    box.appendChild(deleteBtn);

    const contentArea = document.createElement('div');
    contentArea.classList.add('box-content');
    contentArea.contentEditable = 'true';
    contentArea.innerText = boxState.text;
    box.appendChild(contentArea);

    const inputConnector = document.createElement('div');
    inputConnector.classList.add('connector', 'input-connector');
    box.appendChild(inputConnector);

    const outputConnector = document.createElement('div');
    outputConnector.classList.add('connector', 'output-connector');
    box.appendChild(outputConnector);

    const settingsIcon = document.createElement('div');
    settingsIcon.classList.add('settings-icon');
    settingsIcon.innerHTML = '&#9881;';
    box.appendChild(settingsIcon);
    settingsIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      openSettings(box);
    });

    outputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      startConnection(outputConnector);
    });
    inputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      completeConnection(inputConnector);
    });

    box.addEventListener('click', function(e) {
      if (brushMode &&
          !e.target.classList.contains('connector') &&
          !e.target.classList.contains('settings-icon') &&
          !e.target.classList.contains('delete-btn') &&
          !e.target.classList.contains('drag-handle')) {
        box.style.backgroundColor = document.getElementById('brushColor').value;
      }
    });

    canvas.appendChild(box);
    boxMap[box.dataset.id] = box;
    makeBoxDraggable(box);
    updateCanvasSize();
  }

  /******************************************
   *         DRAGGABLE BOXES
   ******************************************/
  function makeBoxDraggable(box) {
    const dragHandle = box.querySelector('.drag-handle');
    let offsetX, offsetY;
    let isDragging = false;
    dragHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      const boxRect = box.getBoundingClientRect();
      const { x: boxX, y: boxY } = screenToCanvas(boxRect.left, boxRect.top);
      const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
      offsetX = mouseX - boxX;
      offsetY = mouseY - boxY;
      document.addEventListener('mousemove', dragMouseMove);
      document.addEventListener('mouseup', dragMouseUp);
    });
    function dragMouseMove(e) {
      if (!isDragging) return;
      const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
      const newLeft = mouseX - offsetX;
      const newTop = mouseY - offsetY;
      box.style.left = newLeft + 'px';
      box.style.top = newTop + 'px';
      updateAllConnections();
    }
    function dragMouseUp() {
      isDragging = false;
      document.removeEventListener('mousemove', dragMouseMove);
      document.removeEventListener('mouseup', dragMouseUp);
      updateAllConnections();
    }
  }

  /******************************************
   *       BOX SETTINGS: CHANGE COLOR
   ******************************************/
  function openSettings(box) {
    let colorInput = box.querySelector('.color-input');
    if (!colorInput) {
      colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.classList.add('color-input');
      colorInput.style.position = 'absolute';
      colorInput.style.top = '30px';
      colorInput.style.right = '2px';
      box.appendChild(colorInput);
      colorInput.addEventListener('input', (e) => {
        box.style.backgroundColor = e.target.value;
      });
      colorInput.addEventListener('blur', () => {
        colorInput.remove();
      });
      colorInput.focus();
    }
  }

  /******************************************
   *       PROFILE FUNCTIONS: NEW, SAVE, LOAD
   ******************************************/
  function newProfile() {
    clearCanvas();
  }

  function saveProfile() {
    const state = gatherState();
    let filename = prompt("Enter filename for profile (without extension):", "profile_" + Date.now());
    if (!filename) {
      filename = "profile_" + Date.now();
    }
    const blob = new Blob([JSON.stringify(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const state = JSON.parse(e.target.result);
        clearCanvas();
        state.boxes.forEach(boxState => {
          createBoxFromState(boxState);
        });
        state.connections.forEach(connState => {
          const fromBox = boxMap[connState.fromBoxId];
          const toBox = boxMap[connState.toBoxId];
          if (fromBox && toBox) {
            createConnection(fromBox, toBox);
          }
        });
      } catch(err) {
        alert("Error loading profile: " + err);
      }
    };
    reader.readAsText(file);
  }

  function gatherState() {
    const boxes = [];
    for (const boxId in boxMap) {
      const box = boxMap[boxId];
      boxes.push({
        id: boxId,
        left: parseFloat(box.style.left),
        top: parseFloat(box.style.top),
        width: parseFloat(box.style.width),
        height: parseFloat(box.style.height),
        backgroundColor: box.style.backgroundColor,
        text: box.querySelector('.box-content').innerText
      });
    }
    const savedConnections = connections.map(conn => ({
      fromBoxId: conn.fromBoxId,
      toBoxId: conn.toBoxId
    }));
    return { boxes, connections: savedConnections };
  }

  function clearCanvas() {
    canvas.querySelectorAll('.box').forEach(box => box.remove());
    svg.innerHTML = '';
    document.querySelectorAll('.connection-delete-btn').forEach(btn => btn.remove());
    connections = [];
    boxMap = {};
    updateCanvasSize();
  }

  function createBoxFromState(boxState) {
    const box = document.createElement('div');
    box.classList.add('box');
    box.style.width = boxState.width + 'px';
    box.style.height = boxState.height + 'px';
    box.style.left = boxState.left + 'px';
    box.style.top = boxState.top + 'px';
    box.style.backgroundColor = boxState.backgroundColor;
    box.dataset.id = boxState.id;

    const dragHandle = document.createElement('div');
    dragHandle.classList.add('drag-handle');
    box.appendChild(dragHandle);

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.innerText = '×';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBox(box);
    });
    box.appendChild(deleteBtn);

    const contentArea = document.createElement('div');
    contentArea.classList.add('box-content');
    contentArea.contentEditable = 'true';
    contentArea.innerText = boxState.text;
    box.appendChild(contentArea);

    const inputConnector = document.createElement('div');
    inputConnector.classList.add('connector', 'input-connector');
    box.appendChild(inputConnector);

    const outputConnector = document.createElement('div');
    outputConnector.classList.add('connector', 'output-connector');
    box.appendChild(outputConnector);

    const settingsIcon = document.createElement('div');
    settingsIcon.classList.add('settings-icon');
    settingsIcon.innerHTML = '&#9881;';
    box.appendChild(settingsIcon);
    settingsIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      openSettings(box);
    });

    outputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      startConnection(outputConnector);
    });
    inputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      completeConnection(inputConnector);
    });

    box.addEventListener('click', function(e) {
      if (brushMode &&
          !e.target.classList.contains('connector') &&
          !e.target.classList.contains('settings-icon') &&
          !e.target.classList.contains('delete-btn') &&
          !e.target.classList.contains('drag-handle')) {
        box.style.backgroundColor = document.getElementById('brushColor').value;
      }
    });

    canvas.appendChild(box);
    boxMap[box.dataset.id] = box;
    makeBoxDraggable(box);
    updateCanvasSize();
  }

  /******************************************
   *         DRAGGABLE BOXES
   ******************************************/
  function makeBoxDraggable(box) {
    const dragHandle = box.querySelector('.drag-handle');
    let offsetX, offsetY;
    let isDragging = false;
    dragHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      const boxRect = box.getBoundingClientRect();
      const { x: boxX, y: boxY } = screenToCanvas(boxRect.left, boxRect.top);
      const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
      offsetX = mouseX - boxX;
      offsetY = mouseY - boxY;
      document.addEventListener('mousemove', dragMouseMove);
      document.addEventListener('mouseup', dragMouseUp);
    });
    function dragMouseMove(e) {
      if (!isDragging) return;
      const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
      const newLeft = mouseX - offsetX;
      const newTop = mouseY - offsetY;
      box.style.left = newLeft + 'px';
      box.style.top = newTop + 'px';
      updateAllConnections();
    }
    function dragMouseUp() {
      isDragging = false;
      document.removeEventListener('mousemove', dragMouseMove);
      document.removeEventListener('mouseup', dragMouseUp);
      updateAllConnections();
    }
  }

  /******************************************
   *       BOX SETTINGS: CHANGE COLOR
   ******************************************/
  function openSettings(box) {
    let colorInput = box.querySelector('.color-input');
    if (!colorInput) {
      colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.classList.add('color-input');
      colorInput.style.position = 'absolute';
      colorInput.style.top = '30px';
      colorInput.style.right = '2px';
      box.appendChild(colorInput);
      colorInput.addEventListener('input', (e) => {
        box.style.backgroundColor = e.target.value;
      });
      colorInput.addEventListener('blur', () => {
        colorInput.remove();
      });
      colorInput.focus();
    }
  }

  /******************************************
   *       PROFILE FUNCTIONS: NEW, SAVE, LOAD
   ******************************************/
  function newProfile() {
    clearCanvas();
  }

  function saveProfile() {
    const state = gatherState();
    let filename = prompt("Enter filename for profile (without extension):", "profile_" + Date.now());
    if (!filename) {
      filename = "profile_" + Date.now();
    }
    const blob = new Blob([JSON.stringify(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const state = JSON.parse(e.target.result);
        clearCanvas();
        state.boxes.forEach(boxState => {
          createBoxFromState(boxState);
        });
        state.connections.forEach(connState => {
          const fromBox = boxMap[connState.fromBoxId];
          const toBox = boxMap[connState.toBoxId];
          if (fromBox && toBox) {
            createConnection(fromBox, toBox);
          }
        });
      } catch(err) {
        alert("Error loading profile: " + err);
      }
    };
    reader.readAsText(file);
  }

  function gatherState() {
    const boxes = [];
    for (const boxId in boxMap) {
      const box = boxMap[boxId];
      boxes.push({
        id: boxId,
        left: parseFloat(box.style.left),
        top: parseFloat(box.style.top),
        width: parseFloat(box.style.width),
        height: parseFloat(box.style.height),
        backgroundColor: box.style.backgroundColor,
        text: box.querySelector('.box-content').innerText
      });
    }
    const savedConnections = connections.map(conn => ({
      fromBoxId: conn.fromBoxId,
      toBoxId: conn.toBoxId
    }));
    return { boxes, connections: savedConnections };
  }

  function clearCanvas() {
    canvas.querySelectorAll('.box').forEach(box => box.remove());
    svg.innerHTML = '';
    document.querySelectorAll('.connection-delete-btn').forEach(btn => btn.remove());
    connections = [];
    boxMap = {};
    updateCanvasSize();
  }

  function createBoxFromState(boxState) {
    const box = document.createElement('div');
    box.classList.add('box');
    box.style.width = boxState.width + 'px';
    box.style.height = boxState.height + 'px';
    box.style.left = boxState.left + 'px';
    box.style.top = boxState.top + 'px';
    box.style.backgroundColor = boxState.backgroundColor;
    box.dataset.id = boxState.id;

    const dragHandle = document.createElement('div');
    dragHandle.classList.add('drag-handle');
    box.appendChild(dragHandle);

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.innerText = '×';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBox(box);
    });
    box.appendChild(deleteBtn);

    const contentArea = document.createElement('div');
    contentArea.classList.add('box-content');
    contentArea.contentEditable = 'true';
    contentArea.innerText = boxState.text;
    box.appendChild(contentArea);

    const inputConnector = document.createElement('div');
    inputConnector.classList.add('connector', 'input-connector');
    box.appendChild(inputConnector);

    const outputConnector = document.createElement('div');
    outputConnector.classList.add('connector', 'output-connector');
    box.appendChild(outputConnector);

    const settingsIcon = document.createElement('div');
    settingsIcon.classList.add('settings-icon');
    settingsIcon.innerHTML = '&#9881;';
    box.appendChild(settingsIcon);
    settingsIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      openSettings(box);
    });

    outputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      startConnection(outputConnector);
    });
    inputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      completeConnection(inputConnector);
    });

    box.addEventListener('click', function(e) {
      if (brushMode &&
          !e.target.classList.contains('connector') &&
          !e.target.classList.contains('settings-icon') &&
          !e.target.classList.contains('delete-btn') &&
          !e.target.classList.contains('drag-handle')) {
        box.style.backgroundColor = document.getElementById('brushColor').value;
      }
    });

    canvas.appendChild(box);
    boxMap[box.dataset.id] = box;
    makeBoxDraggable(box);
    updateCanvasSize();
  }

  /******************************************
   *         DRAGGABLE BOXES
   ******************************************/
  function makeBoxDraggable(box) {
    const dragHandle = box.querySelector('.drag-handle');
    let offsetX, offsetY;
    let isDragging = false;
    dragHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      const boxRect = box.getBoundingClientRect();
      const { x: boxX, y: boxY } = screenToCanvas(boxRect.left, boxRect.top);
      const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
      offsetX = mouseX - boxX;
      offsetY = mouseY - boxY;
      document.addEventListener('mousemove', dragMouseMove);
      document.addEventListener('mouseup', dragMouseUp);
    });
    function dragMouseMove(e) {
      if (!isDragging) return;
      const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
      const newLeft = mouseX - offsetX;
      const newTop = mouseY - offsetY;
      box.style.left = newLeft + 'px';
      box.style.top = newTop + 'px';
      updateAllConnections();
    }
    function dragMouseUp() {
      isDragging = false;
      document.removeEventListener('mousemove', dragMouseMove);
      document.removeEventListener('mouseup', dragMouseUp);
      updateAllConnections();
    }
  }

  /******************************************
   *       BOX SETTINGS: CHANGE COLOR
   ******************************************/
  function openSettings(box) {
    let colorInput = box.querySelector('.color-input');
    if (!colorInput) {
      colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.classList.add('color-input');
      colorInput.style.position = 'absolute';
      colorInput.style.top = '30px';
      colorInput.style.right = '2px';
      box.appendChild(colorInput);
      colorInput.addEventListener('input', (e) => {
        box.style.backgroundColor = e.target.value;
      });
      colorInput.addEventListener('blur', () => {
        colorInput.remove();
      });
      colorInput.focus();
    }
  }

  /******************************************
   *       PROFILE FUNCTIONS: NEW, SAVE, LOAD
   ******************************************/
  function newProfile() {
    clearCanvas();
  }

  function saveProfile() {
    const state = gatherState();
    let filename = prompt("Enter filename for profile (without extension):", "profile_" + Date.now());
    if (!filename) {
      filename = "profile_" + Date.now();
    }
    const blob = new Blob([JSON.stringify(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const state = JSON.parse(e.target.result);
        clearCanvas();
        state.boxes.forEach(boxState => {
          createBoxFromState(boxState);
        });
        state.connections.forEach(connState => {
          const fromBox = boxMap[connState.fromBoxId];
          const toBox = boxMap[connState.toBoxId];
          if (fromBox && toBox) {
            createConnection(fromBox, toBox);
          }
        });
      } catch(err) {
        alert("Error loading profile: " + err);
      }
    };
    reader.readAsText(file);
  }

  function gatherState() {
    const boxes = [];
    for (const boxId in boxMap) {
      const box = boxMap[boxId];
      boxes.push({
        id: boxId,
        left: parseFloat(box.style.left),
        top: parseFloat(box.style.top),
        width: parseFloat(box.style.width),
        height: parseFloat(box.style.height),
        backgroundColor: box.style.backgroundColor,
        text: box.querySelector('.box-content').innerText
      });
    }
    const savedConnections = connections.map(conn => ({
      fromBoxId: conn.fromBoxId,
      toBoxId: conn.toBoxId
    }));
    return { boxes, connections: savedConnections };
  }

  function clearCanvas() {
    canvas.querySelectorAll('.box').forEach(box => box.remove());
    svg.innerHTML = '';
    document.querySelectorAll('.connection-delete-btn').forEach(btn => btn.remove());
    connections = [];
    boxMap = {};
    updateCanvasSize();
  }

  function createBoxFromState(boxState) {
    const box = document.createElement('div');
    box.classList.add('box');
    box.style.width = boxState.width + 'px';
    box.style.height = boxState.height + 'px';
    box.style.left = boxState.left + 'px';
    box.style.top = boxState.top + 'px';
    box.style.backgroundColor = boxState.backgroundColor;
    box.dataset.id = boxState.id;

    const dragHandle = document.createElement('div');
    dragHandle.classList.add('drag-handle');
    box.appendChild(dragHandle);

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.innerText = '×';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBox(box);
    });
    box.appendChild(deleteBtn);

    const contentArea = document.createElement('div');
    contentArea.classList.add('box-content');
    contentArea.contentEditable = 'true';
    contentArea.innerText = boxState.text;
    box.appendChild(contentArea);

    const inputConnector = document.createElement('div');
    inputConnector.classList.add('connector', 'input-connector');
    box.appendChild(inputConnector);

    const outputConnector = document.createElement('div');
    outputConnector.classList.add('connector', 'output-connector');
    box.appendChild(outputConnector);

    const settingsIcon = document.createElement('div');
    settingsIcon.classList.add('settings-icon');
    settingsIcon.innerHTML = '&#9881;';
    box.appendChild(settingsIcon);
    settingsIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      openSettings(box);
    });

    outputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      startConnection(outputConnector);
    });
    inputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      completeConnection(inputConnector);
    });

    box.addEventListener('click', function(e) {
      if (brushMode &&
          !e.target.classList.contains('connector') &&
          !e.target.classList.contains('settings-icon') &&
          !e.target.classList.contains('delete-btn') &&
          !e.target.classList.contains('drag-handle')) {
        box.style.backgroundColor = document.getElementById('brushColor').value;
      }
    });

    canvas.appendChild(box);
    boxMap[box.dataset.id] = box;
    makeBoxDraggable(box);
    updateCanvasSize();
  }

  /******************************************
   *         DRAGGABLE BOXES
   ******************************************/
  function makeBoxDraggable(box) {
    const dragHandle = box.querySelector('.drag-handle');
    let offsetX, offsetY;
    let isDragging = false;
    dragHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      const boxRect = box.getBoundingClientRect();
      const { x: boxX, y: boxY } = screenToCanvas(boxRect.left, boxRect.top);
      const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
      offsetX = mouseX - boxX;
      offsetY = mouseY - boxY;
      document.addEventListener('mousemove', dragMouseMove);
      document.addEventListener('mouseup', dragMouseUp);
    });
    function dragMouseMove(e) {
      if (!isDragging) return;
      const { x: mouseX, y: mouseY } = screenToCanvas(e.clientX, e.clientY);
      const newLeft = mouseX - offsetX;
      const newTop = mouseY - offsetY;
      box.style.left = newLeft + 'px';
      box.style.top = newTop + 'px';
      updateAllConnections();
    }
    function dragMouseUp() {
      isDragging = false;
      document.removeEventListener('mousemove', dragMouseMove);
      document.removeEventListener('mouseup', dragMouseUp);
      updateAllConnections();
    }
  }

  /******************************************
   *       BOX SETTINGS: CHANGE COLOR
   ******************************************/
  function openSettings(box) {
    let colorInput = box.querySelector('.color-input');
    if (!colorInput) {
      colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.classList.add('color-input');
      colorInput.style.position = 'absolute';
      colorInput.style.top = '30px';
      colorInput.style.right = '2px';
      box.appendChild(colorInput);
      colorInput.addEventListener('input', (e) => {
        box.style.backgroundColor = e.target.value;
      });
      colorInput.addEventListener('blur', () => {
        colorInput.remove();
      });
      colorInput.focus();
    }
  }

  /******************************************
   *       PROFILE FUNCTIONS: NEW, SAVE, LOAD
   ******************************************/
  function newProfile() {
    clearCanvas();
  }

  function saveProfile() {
    const state = gatherState();
    let filename = prompt("Enter filename for profile (without extension):", "profile_" + Date.now());
    if (!filename) {
      filename = "profile_" + Date.now();
    }
    const blob = new Blob([JSON.stringify(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const state = JSON.parse(e.target.result);
        clearCanvas();
        state.boxes.forEach(boxState => {
          createBoxFromState(boxState);
        });
        state.connections.forEach(connState => {
          const fromBox = boxMap[connState.fromBoxId];
          const toBox = boxMap[connState.toBoxId];
          if (fromBox && toBox) {
            createConnection(fromBox, toBox);
          }
        });
      } catch(err) {
        alert("Error loading profile: " + err);
      }
    };
    reader.readAsText(file);
  }

  function gatherState() {
    const boxes = [];
    for (const boxId in boxMap) {
      const box = boxMap[boxId];
      boxes.push({
        id: boxId,
        left: parseFloat(box.style.left),
        top: parseFloat(box.style.top),
        width: parseFloat(box.style.width),
        height: parseFloat(box.style.height),
        backgroundColor: box.style.backgroundColor,
        text: box.querySelector('.box-content').innerText
      });
    }
    const savedConnections = connections.map(conn => ({
      fromBoxId: conn.fromBoxId,
      toBoxId: conn.toBoxId
    }));
    return { boxes, connections: savedConnections };
  }

  function clearCanvas() {
    canvas.querySelectorAll('.box').forEach(box => box.remove());
    svg.innerHTML = '';
    document.querySelectorAll('.connection-delete-btn').forEach(btn => btn.remove());
    connections = [];
    boxMap = {};
    updateCanvasSize();
  }

  function createBoxFromState(boxState) {
    const box = document.createElement('div');
    box.classList.add('box');
    box.style.width = boxState.width + 'px';
    box.style.height = boxState.height + 'px';
    box.style.left = boxState.left + 'px';
    box.style.top = boxState.top + 'px';
    box.style.backgroundColor = boxState.backgroundColor;
    box.dataset.id = boxState.id;

    const dragHandle = document.createElement('div');
    dragHandle.classList.add('drag-handle');
    box.appendChild(dragHandle);

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.innerText = '×';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBox(box);
    });
    box.appendChild(deleteBtn);

    const contentArea = document.createElement('div');
    contentArea.classList.add('box-content');
    contentArea.contentEditable = 'true';
    contentArea.innerText = boxState.text;
    box.appendChild(contentArea);

    const inputConnector = document.createElement('div');
    inputConnector.classList.add('connector', 'input-connector');
    box.appendChild(inputConnector);

    const outputConnector = document.createElement('div');
    outputConnector.classList.add('connector', 'output-connector');
    box.appendChild(outputConnector);

    const settingsIcon = document.createElement('div');
    settingsIcon.classList.add('settings-icon');
    settingsIcon.innerHTML = '&#9881;';
    box.appendChild(settingsIcon);
    settingsIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      openSettings(box);
    });

    outputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      startConnection(outputConnector);
    });
    inputConnector.addEventListener('click', (e) => {
      e.stopPropagation();
      completeConnection(inputConnector);
    });

    box.addEventListener('click', function(e) {
      if (brushMode &&
          !e.target.classList.contains('connector') &&
          !e.target.classList.contains('settings-icon') &&
          !e.target.classList.contains('delete-btn') &&
          !e.target.classList.contains('drag-handle')) {
        box.style.backgroundColor = document.getElementById('brushColor').value;
      }
    });

    canvas.appendChild(box);
    boxMap[box.dataset.id] = box;
    makeBoxDraggable(box);
    updateCanvasSize();
  }

  /******************************************
   *         HELPER FUNCTIONS
   ******************************************/
  function getConnectorCenter(rect) {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return screenToCanvas(centerX, centerY);
  }

  function screenToCanvas(screenX, screenY) {
    const wrapperRect = canvasWrapper.getBoundingClientRect();
    const x = (screenX - wrapperRect.left - translateX) / scale;
    const y = (screenY - wrapperRect.top - translateY) / scale;
    return { x, y };
  }

  function updateConnectionDeleteButton(conn) {
    const x1 = parseFloat(conn.line.getAttribute('x1'));
    const y1 = parseFloat(conn.line.getAttribute('y1'));
    const x2 = parseFloat(conn.line.getAttribute('x2'));
    const y2 = parseFloat(conn.line.getAttribute('y2'));
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;
    conn.deleteBtn.style.left = (centerX - 10) + 'px';
    conn.deleteBtn.style.top = (centerY - 10) + 'px';
  }

  /******************************************
   *         HELPER: CREATE CONNECTION
   ******************************************/
  function createConnection(fromBox, toBox) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute('stroke', '#fff');
    line.setAttribute('stroke-width', '2');
    svg.appendChild(line);
    const fromConnector = fromBox.querySelector('.output-connector');
    const toConnector = toBox.querySelector('.input-connector');
    const fromRect = fromConnector.getBoundingClientRect();
    const toRect = toConnector.getBoundingClientRect();
    const fromCenter = getConnectorCenter(fromRect);
    const toCenter = getConnectorCenter(toRect);
    line.setAttribute('x1', fromCenter.x);
    line.setAttribute('y1', fromCenter.y);
    line.setAttribute('x2', toCenter.x);
    line.setAttribute('y2', toCenter.y);
    let conn = {
      fromBoxId: fromBox.dataset.id,
      toBoxId: toBox.dataset.id,
      line,
      deleteBtn: null
    };
    connections.push(conn);
    createConnectionDeleteButton(conn);
  }

  function createConnectionDeleteButton(conn) {
    const btn = document.createElement('button');
    btn.classList.add('connection-delete-btn');
    btn.innerText = '×';
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      deleteConnection(conn);
    });
    canvas.appendChild(btn);
    conn.deleteBtn = btn;
    updateConnectionDeleteButton(conn);
  }

  function deleteConnection(conn) {
    conn.line.remove();
    if (conn.deleteBtn) conn.deleteBtn.remove();
    connections = connections.filter(c => c !== conn);
  }
});
