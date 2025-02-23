document.addEventListener('DOMContentLoaded', () => {
  // 設定画面用要素
  const configScreen = document.getElementById('config-screen');
  const studentInfoTextarea = document.getElementById('student-info');
  const rowCountSelect = document.getElementById('row-count');
  const colCountSelect = document.getElementById('col-count');
  const previewGridContainer = document.getElementById('preview-grid');
  const assignmentOrderSelect = document.getElementById('assignment-order');
  const autoModeSelect = document.getElementById('auto-mode');
  const autoIntervalContainer = document.getElementById('auto-interval-container');
  const autoIntervalInput = document.getElementById('auto-interval');
  const startAssignmentButton = document.getElementById('start-assignment-button');
  const autoNumberCheckbox = document.getElementById('auto-number');
  const showFuriganaCheckbox = document.getElementById('show-furigana');

  
  // 席替え画面用要素
  const assignmentScreen = document.getElementById('assignment-screen');
  const assignButton = document.getElementById('assign-button');
  const instruction = document.getElementById('instruction');
  const seatTable = document.getElementById('seat-table');
  const leftPane = document.getElementById('left-pane');

  // グローバル変数
  let students = [];
  let rows, cols;
  let excludedSeats = []; // プレビューで「使わない席」と指定されたセル
  let occupiedSeats = [];
  let currentIndex = 0;
  let lastNewAssignedCell = null;
  let autoMode = false;
  let autoInterval = 0;
  let autoTimer = null;

  // プレビューグリッド生成
  generatePreviewGrid();

  // プレビュー用：行数、列数変更時に再生成
  rowCountSelect.addEventListener('change', generatePreviewGrid);
  colCountSelect.addEventListener('change', generatePreviewGrid);

  // オートモード選択で間隔入力表示の切替
  autoModeSelect.addEventListener('change', () => {
    if (autoModeSelect.value === 'auto') {
      autoIntervalContainer.style.display = 'block';
    } else {
      autoIntervalContainer.style.display = 'none';
    }
  });

  // 「席替えを始める」ボタン
  startAssignmentButton.addEventListener('click', () => {
    // 学生情報のパース
    const lines = studentInfoTextarea.value.split('\n').filter(line => line.trim() !== '');
    try {
      if (autoNumberCheckbox.checked) {
        // 自動割り当てONの場合
        students = lines.map((line, index) => {
          const parts = line.split(',').map(p => p.trim());
          if (showFuriganaCheckbox.checked) {
            // 入力形式は「名前, 読み仮名」かどうか
            if (parts.length !== 2 || !parts[0]) {
              throw new Error(`フォーマットエラー：自動割り当てON, 読み仮名ONの場合は「名前, 読み仮名」を入力してください。（対象行：${line}）`);
            }
            return { number: index + 1, name: parts[0], reading: parts[1] };
          } else {
            // 入力形式は「名前」だけであること
            if (parts.length !== 1 || !parts[0]) {
              throw new Error(`フォーマットエラー：自動割り当てON, 読み仮名OFFの場合は「名前」のみを入力してください。（対象行：${line}）`);
            }
            return { number: index + 1, name: parts[0], reading: "" };
          }
        });
      } else {
        // 自動割り当てOFFの場合
        students = lines.map(line => {
          const parts = line.split(',').map(p => p.trim());
          if (showFuriganaCheckbox.checked) {
            // 入力形式は「番号, 名前, 読み仮名」
            if (parts.length !== 3 || isNaN(parseInt(parts[0], 10)) || !parts[1]) {
              throw new Error(`フォーマットエラー：番号の自動割り当てOFF, 読み仮名ONの場合は「番号, 名前, 読み仮名」を入力してください。（対象行：${line}）`);
            }
            return { number: parseInt(parts[0], 10), name: parts[1], reading: parts[2] };
          } else {
            // 入力形式は「番号, 名前」
            if (parts.length !== 2 || isNaN(parseInt(parts[0], 10)) || !parts[1]) {
              throw new Error(`フォーマットエラー：番号の自動割り当てOFF, 読み仮名OFFの場合は「番号, 名前」を入力してください。（対象行：${line}）`);
            }
            return { number: parseInt(parts[0], 10), name: parts[1], reading: "" };
          }
        });
      }
    } catch (e) {
      alert(e.message);
      return;
    }    
    
    // 座席の行数・列数の設定
    rows = parseInt(rowCountSelect.value, 10);
    cols = parseInt(colCountSelect.value, 10);

    // プレビューグリッドから除外席を取得
    excludedSeats = [];
    previewGridContainer.querySelectorAll('button').forEach(btn => {
      const r = parseInt(btn.getAttribute('data-row'), 10);
      const c = parseInt(btn.getAttribute('data-col'), 10);
      if (btn.classList.contains('excluded')) {
        excludedSeats.push({ row: r, col: c });
      }
    });

    // 利用可能な席数チェック
    const totalSeats = rows * cols;
    const availableSeats = totalSeats - excludedSeats.length;
    if (availableSeats < students.length) {
      alert(`利用可能な席数(${availableSeats})が学生数(${students.length})に足りません。席数を調整してください。`);
      return;
    }

    // 席決定順の処理
    const order = assignmentOrderSelect.value;
    if (order === 'asc') {
      students.sort((a, b) => a.number - b.number);
    } else if (order === 'desc') {
      students.sort((a, b) => b.number - a.number);
    } else if (order === 'random') {
      for (let i = students.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [students[i], students[j]] = [students[j], students[i]];
      }
    }
    
    // オートモード設定
    autoMode = (autoModeSelect.value === 'auto');
    if (autoMode) {
      autoInterval = parseFloat(autoIntervalInput.value);
      if (isNaN(autoInterval) || autoInterval < 0) {
        alert('正しい間隔（秒）を入力してください。');
        return;
      }
    }

    // 初期化
    currentIndex = 0;
    occupiedSeats = [];

    // 設定画面非表示、席替え画面表示
    configScreen.style.display = 'none';
    assignmentScreen.style.display = 'flex';

    // 席替え画面テーブル生成
    generateTable();
    updateInstruction();

    // オートモードの場合、手動ボタンを非表示し、自動実行開始
    if (autoMode) {
      assignButton.style.display = 'none';
      autoTimer = setInterval(() => {
        if (currentIndex < students.length) {
          assignSeat();
        } else {
          clearInterval(autoTimer);
        }
      }, autoInterval * 1000);
    }
  });

  function updateStudentInfoLabel() {
    // auto-number: 自動割り当て、showFurigana:  読み仮名表示
    if (autoNumberCheckbox.checked) {
      if (showFuriganaCheckbox.checked) {
        // 自動割り当てON,  読み仮名ON: 入力は「名前, 読み仮名」
        document.getElementById('student-info-label').textContent = "生徒情報　";
        document.getElementById('explanation').textContent = "※「名前, 読み仮名」を番号順に改行区切りで入力";
        studentInfoTextarea.placeholder = "例：織田,おだ\n　　徳川,とくがわ\n　　豊臣,とよとみ";
      } else {
        // 自動割り当てON,  読み仮名OFF: 入力は「名前」だけ
        document.getElementById('student-info-label').textContent = "生徒情報　";
        document.getElementById('explanation').textContent = "※名前を番号順に改行区切りで入力";
        studentInfoTextarea.placeholder = "例：織田\n　　徳川\n　　豊臣";
      }
    } else {
      if (showFuriganaCheckbox.checked) {
        // 自動割り当てOFF,  読み仮名ON: 入力は「番号, 名前, 読み仮名」
        document.getElementById('student-info-label').textContent = "生徒情報　";
        document.getElementById('explanation').textContent = "※「番号, 名前, 読み仮名」を改行区切りで入力";
        studentInfoTextarea.placeholder = "例：1,織田,おだ\n　　2,徳川,とくがわ\n　　3,豊臣,とよとみ";
      } else {
        // 自動割り当てOFF,  読み仮名OFF: 入力は「番号, 名前」
        document.getElementById('student-info-label').textContent = "生徒情報　";
        document.getElementById('explanation').textContent = "※「番号, 名前」を改行区切りで入力";
        studentInfoTextarea.placeholder = "例：1,織田\n　　2,徳川\n　　3,豊臣";
      }
    }
  }
  autoNumberCheckbox.addEventListener('change', updateStudentInfoLabel);
  showFuriganaCheckbox.addEventListener('change', updateStudentInfoLabel);
  updateStudentInfoLabel();  
  
  // プレビューグリッド生成
  function generatePreviewGrid() {
    const previewRows = parseInt(rowCountSelect.value, 10);
    const previewCols = parseInt(colCountSelect.value, 10);
    previewGridContainer.innerHTML = '';
    const table = document.createElement('table');
    for (let r = 0; r < previewRows; r++) {
      const row = document.createElement('tr');
      for (let c = 0; c < previewCols; c++) {
        const cell = document.createElement('td');
        const btn = document.createElement('button');
        btn.textContent = '';
        btn.setAttribute('data-row', r);
        btn.setAttribute('data-col', c);
        btn.addEventListener('click', () => {
          if (btn.classList.contains('excluded')) {
            btn.classList.remove('excluded');
            btn.textContent = '';
          } else {
            btn.classList.add('excluded');
            btn.textContent = '✕';
          }
        });
        cell.appendChild(btn);
        row.appendChild(cell);
      }
      table.appendChild(row);
    }
    previewGridContainer.appendChild(table);
  }

  // 席替え画面のグリッド生成
  function generateTable() {
    seatTable.innerHTML = '';
    for (let r = 0; r < rows; r++) {
      const row = seatTable.insertRow();
      for (let c = 0; c < cols; c++) {
        const cell = row.insertCell();
        if (excludedSeats.some(seat => seat.row === r && seat.col === c)) {
          cell.classList.add('x');
          cell.textContent = '✕';
        } else {
          cell.textContent = '\u2003';
        }
      }
    }
  }

  function updateInstruction() {
    if (currentIndex < students.length) {
      if (autoMode) {
        instruction.style.display = 'block';
        instruction.textContent = `${students[currentIndex].name}さんの席を決めています……`;
        assignButton.textContent = "席を決める";
      } else {
        instruction.style.display = 'none';
        assignButton.textContent = `${students[currentIndex].name}さんの席を決める`;
      }
    } else {
      instruction.style.display = 'block';
      instruction.textContent = '席替えが完了しました！';
      assignButton.style.display = 'none';
      addPostAssignmentControls();
    }
  }  

  function assignSeat() {
    if (currentIndex >= students.length) return;
    
    let seat;
    do {
      const row = Math.floor(Math.random() * rows);
      const col = Math.floor(Math.random() * cols);
      seat = { row, col };
    } while (
      occupiedSeats.some(s => s.row === seat.row && s.col === seat.col) ||
      excludedSeats.some(s => s.row === seat.row && s.col === seat.col)
    );
    
    let movingCircle;
    const interval = setInterval(() => {
      if (movingCircle) movingCircle.classList.remove('circle');
      const r = Math.floor(Math.random() * rows);
      const c = Math.floor(Math.random() * cols);
      movingCircle = seatTable.rows[r].cells[c];
      movingCircle.classList.add('circle');
    }, 200);
    
    clearInterval(interval);
    if (movingCircle) movingCircle.classList.remove('circle');
    const finalCell = seatTable.rows[seat.row].cells[seat.col];
    finalCell.classList.add('occupied');
    finalCell.textContent = students[currentIndex].name;
    occupiedSeats.push(seat);
    if (lastNewAssignedCell) {
      lastNewAssignedCell.classList.remove('new-assigned');
    }
    finalCell.classList.add('new-assigned');
    lastNewAssignedCell = finalCell;
    
    currentIndex++;
    updateInstruction();
  }

  assignButton.addEventListener('click', assignSeat);

  function addPostAssignmentControls() {
    let controlsDiv = document.getElementById('post-assignment-controls');
    if (!controlsDiv) {
      controlsDiv = document.createElement('div');
      controlsDiv.id = 'post-assignment-controls';
      controlsDiv.style.marginTop = '20px';
      controlsDiv.style.display = 'flex';
      controlsDiv.style.flexDirection = 'column';
      controlsDiv.style.gap = '10px';
      leftPane.appendChild(controlsDiv);
    }
    
    const showResultButton = document.createElement('button');
    showResultButton.id = 'show-result-button';
    showResultButton.textContent = '座席表を生成';
    showResultButton.classList.add('assign-button');
    showResultButton.addEventListener('click', () => {
      displayFullscreen();
    });
    
    const swapSeatButton = document.createElement('button');
    swapSeatButton.id = 'swap-seat-button';
    swapSeatButton.textContent = '席を入れ替える';
    swapSeatButton.classList.add('assign-button');
    swapSeatButton.addEventListener('click', () => {
      swapSeatButton.style.display = 'none';
      showSwapControls();
      if (lastNewAssignedCell) {
        lastNewAssignedCell.classList.remove('new-assigned');
      }
    });
    
    controlsDiv.appendChild(showResultButton);
    controlsDiv.appendChild(swapSeatButton);
  }
  
  function showSwapControls() {
    let controlsDiv = document.getElementById('post-assignment-controls');
    
    const input1 = document.createElement('input');
    input1.type = 'number';
    input1.id = 'swap-input-1';
    input1.placeholder = '入れ替える人の番号1';
    
    const input2 = document.createElement('input');
    input2.type = 'number';
    input2.id = 'swap-input-2';
    input2.placeholder = '入れ替える人の番号2';
    
    const confirmSwapButton = document.createElement('button');
    confirmSwapButton.id = 'confirm-swap-button';
    confirmSwapButton.textContent = '入れ替えを決定';
    confirmSwapButton.classList.add('assign-button');
    confirmSwapButton.addEventListener('click', () => {
      const num1 = parseInt(input1.value);
      const num2 = parseInt(input2.value);
      if (isNaN(num1) || isNaN(num2)) {
        alert('両方の番号を入力してください。');
        return;
      }
      performSwap(num1, num2);
      input1.remove();
      input2.remove();
      confirmSwapButton.remove();
      const swapSeatButton = document.getElementById('swap-seat-button');
      swapSeatButton.style.display = 'block';
    });
    
    controlsDiv.appendChild(input1);
    controlsDiv.appendChild(input2);
    controlsDiv.appendChild(confirmSwapButton);
  }
  
  function performSwap(num1, num2) {
    const index1 = students.findIndex(s => s.number === num1);
    const index2 = students.findIndex(s => s.number === num2);
    if (index1 === -1 || index2 === -1) {
      alert('入力された番号の学生が見つかりません。');
      return;
    }
    const seatA = occupiedSeats[index1];
    const seatB = occupiedSeats[index2];
    if (!seatA || !seatB) {
      alert('指定された学生は席に割り当てられていません。');
      return;
    }
    const originalSeatA = { ...seatA };
    const originalSeatB = { ...seatB };
    occupiedSeats[index1] = seatB;
    occupiedSeats[index2] = seatA;
    
    const cellForStudent1 = seatTable.rows[originalSeatB.row].cells[originalSeatB.col];
    cellForStudent1.textContent = students[index1].name;
    cellForStudent1.classList.add('occupied');
    
    const cellForStudent2 = seatTable.rows[originalSeatA.row].cells[originalSeatA.col];
    cellForStudent2.textContent = students[index2].name;
    cellForStudent2.classList.add('occupied');
  }
  
  function displayFullscreen() {
    const fullscreenDiv = document.createElement('div');
    fullscreenDiv.classList.add('fullscreen');
    
    const fullscreenTable = document.createElement('table');
    fullscreenTable.id = 'seat-table';
    
    for (let r = 0; r < rows; r++) {
      const row = fullscreenTable.insertRow();
      for (let c = 0; c < cols; c++) {
        const cell = row.insertCell();
        if (excludedSeats.some(seat => seat.row === r && seat.col === c)) {
          cell.classList.add('x');
          cell.textContent = '✕';
        } else {
          const occupied = occupiedSeats.find(s => s.row === r && s.col === c);
          if (occupied) {
            const studentIndex = occupiedSeats.indexOf(occupied);
            const student = students[studentIndex];
            if (showFuriganaCheckbox.checked && student.reading) {
              cell.innerHTML = `
                <span class="yomigana">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${student.reading}</span><br>
                <span class="number">${student.number} </span>
                <span class="kanji">${student.name}</span>
              `;
            } else {
              cell.innerHTML = `<span class="number">${student.number} </span><span class="kanji">${student.name}</span>`;
            }            
          } else {
            cell.textContent = '\u2003';
          }
        }
      }
    }
    
    fullscreenDiv.appendChild(fullscreenTable);
    
    const saveButton = document.createElement('button');
    saveButton.textContent = '画像として保存';
    fullscreenDiv.appendChild(saveButton);
    
    document.body.appendChild(fullscreenDiv);
    
    saveButton.addEventListener('click', () => {
      html2canvas(fullscreenTable).then(canvas => {
        const link = document.createElement('a');
        link.download = 'seating-chart.png';
        link.href = canvas.toDataURL();
        link.click();
      });
    });
  }
});
