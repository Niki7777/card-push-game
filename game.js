class CardPushGame {
    constructor() {
        this.rows = 10;
        this.cols = 8;
        this.colors = 7;
        this.rainbowCount = 4;
        this.board = [];
        this.hand = [null, null];
        this.selectedHandIndex = -1;
        this.score = 0;
        this.energy = 100;
        this.history = [];
        this.isProcessing = false;
        this.isDragging = false;
        this.draggedCard = null;
        this.currentCol = -1;

        this.modeConfig = {
            name: '能量挑战',
            icon: '⚡',
            statLabel: '能量',
            initialEnergy: 100,
            drawCost: 15,
            restorePerBlock: 1.5
        };

        this.init();
    }

    init() {
        this.bindEvents();
        this.showScreen('main-menu');
    }

    bindEvents() {
        document.querySelector('.mode-btn').addEventListener('click', () => this.startGame());
        document.querySelector('.back-btn').addEventListener('click', () => this.showScreen('main-menu'));
        document.getElementById('pause-btn').addEventListener('click', () => this.pauseGame());
        document.getElementById('resume-btn').addEventListener('click', () => this.resumeGame());
        document.getElementById('restart-btn').addEventListener('click', () => this.restartGame());
        document.getElementById('quit-btn').addEventListener('click', () => this.showScreen('main-menu'));
        document.getElementById('undo-btn').addEventListener('click', () => this.undo());
        document.getElementById('hint-btn').addEventListener('click', () => this.showHint());
        document.getElementById('play-again-btn').addEventListener('click', () => this.restartGame());
        document.getElementById('back-menu-btn').addEventListener('click', () => this.showScreen('main-menu'));

        // 手牌槽位拖动事件
        document.querySelectorAll('.hand-slot').forEach((slot, index) => {
            slot.addEventListener('mousedown', (e) => this.startDrag(e, index));
            slot.addEventListener('touchstart', (e) => this.startDrag(e, index), { passive: false });
        });

        // 全局拖动事件
        document.addEventListener('mousemove', (e) => this.onDrag(e));
        document.addEventListener('touchmove', (e) => this.onDrag(e), { passive: false });
        document.addEventListener('mouseup', (e) => this.endDrag(e));
        document.addEventListener('touchend', (e) => this.endDrag(e));
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }

    async startGame() {
        this.resetGame();
        this.generateBoard();
        this.renderBoard();
        this.renderPlayArea();
        this.updateUI();
        this.showScreen('game-screen');

        // 开局自动检查消除，不限制次数，彩虹牌不参与
        await this.processElimination(true, Infinity);
    }

    resetGame() {
        this.board = [];
        this.hand = [null, null];
        this.selectedHandIndex = -1;
        this.score = 0;
        this.energy = this.modeConfig.initialEnergy;
        this.history = [];
        this.isProcessing = false;
        this.isDragging = false;
        this.draggedCard = null;
        this.currentCol = -1;

        this.updateHandUI();
        this.clearDragElements();
    }

    generateBoard() {
        const totalCells = this.rows * this.cols - this.rainbowCount;
        const colorCounts = {};

        for (let i = 1; i <= this.colors; i++) {
            colorCounts[i] = Math.floor(totalCells / this.colors);
            if (colorCounts[i] % 2 !== 0) colorCounts[i]--;
        }

        let remaining = totalCells - Object.values(colorCounts).reduce((a, b) => a + b, 0);
        while (remaining > 0) {
            for (let i = 1; i <= this.colors && remaining > 0; i++) {
                colorCounts[i] += 2;
                remaining -= 2;
            }
        }

        const colorPool = [];
        for (let i = 1; i <= this.colors; i++) {
            for (let j = 0; j < colorCounts[i]; j++) colorPool.push(i);
        }
        for (let i = 0; i < this.rainbowCount; i++) colorPool.push('rainbow');

        for (let i = colorPool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [colorPool[i], colorPool[j]] = [colorPool[j], colorPool[i]];
        }

        for (let r = 0; r < this.rows; r++) {
            this.board[r] = [];
            for (let c = 0; c < this.cols; c++) {
                this.board[r][c] = colorPool[r * this.cols + c];
            }
        }
    }

    renderBoard() {
        const boardEl = document.getElementById('game-board');
        boardEl.innerHTML = '';

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = r;
                cell.dataset.col = c;

                const color = this.board[r][c];
                if (color) {
                    cell.classList.add(`color-${color}`);
                    cell.addEventListener('click', () => this.handleCellClick(r, c));
                } else {
                    cell.classList.add('empty');
                }

                boardEl.appendChild(cell);
            }
        }
    }

    renderPlayArea() {
        const grid = document.getElementById('play-area-grid');
        if (!grid) return;
        grid.innerHTML = '';

        for (let c = 0; c < this.cols; c++) {
            const cell = document.createElement('div');
            cell.className = 'play-area-cell';
            cell.dataset.col = c;
            grid.appendChild(cell);
        }
    }

    handleCellClick(row, col) {
        if (this.isProcessing || this.isDragging) return;

        // 抽牌：只能抽最下面一排的非空方块
        const color = this.board[row][col];
        if (row === this.getBottomRow(col) && color !== null) {
            this.drawCard(col);
        }
    }

    getBottomRow(col) {
        for (let r = this.rows - 1; r >= 0; r--) {
            if (this.board[r] && this.board[r][col] !== null && this.board[r][col] !== undefined) {
                return r;
            }
        }
        return -1;
    }

    async drawCard(col) {
        const emptySlot = this.hand.findIndex(h => h === null);
        if (emptySlot === -1) {
            this.showMessage('手牌已满！');
            return;
        }

        if (this.energy < this.modeConfig.drawCost) {
            this.showMessage('能量不足！');
            return;
        }

        this.energy -= this.modeConfig.drawCost;
        this.saveHistory();

        const row = this.getBottomRow(col);
        const color = this.board[row][col];

        // 获取被抽的卡牌元素
        const cells = document.querySelectorAll('.cell');
        const cardEl = cells[row * this.cols + col];

        // 抽牌动画：移动到手牌槽位
        await this.animateDrawCard(cardEl, color, emptySlot);

        this.hand[emptySlot] = { color: color, fromCol: col };
        this.board[row][col] = null;
        this.shiftColumnDown(col);

        this.updateHandUI();
        this.renderBoard();
        this.updateUI();
        this.processElimination();
    }

    animateDrawCard(cardEl, color, slotIndex) {
        return new Promise(resolve => {
            const flyingCard = document.createElement('div');
            flyingCard.className = `cell color-${color} flying-card`;
            const rect = cardEl.getBoundingClientRect();
            flyingCard.style.left = rect.left + 'px';
            flyingCard.style.top = rect.top + 'px';
            flyingCard.style.width = rect.width + 'px';
            flyingCard.style.height = rect.height + 'px';
            document.body.appendChild(flyingCard);

            const handSlots = document.querySelectorAll('.hand-slot');
            const targetSlot = handSlots[slotIndex];
            const targetRect = targetSlot.getBoundingClientRect();

            setTimeout(() => {
                flyingCard.style.transform = `translate(${targetRect.left - rect.left}px, ${targetRect.top - rect.top}px) scale(0.9)`;
                flyingCard.style.opacity = '0';
            }, 10);

            setTimeout(() => {
                flyingCard.remove();
                resolve();
            }, 400);
        });
    }

    // 拖动相关方法
    startDrag(e, index) {
        if (this.isProcessing || !this.hand[index]) return;

        e.preventDefault();
        this.isDragging = true;
        this.selectedHandIndex = index;

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        // 创建拖动卡牌
        const card = this.hand[index];
        this.draggedCard = document.createElement('div');
        this.draggedCard.className = `cell color-${card.color} dragging-card`;

        const handSlots = document.querySelectorAll('.hand-slot');
        const slotRect = handSlots[index].getBoundingClientRect();

        this.draggedCard.style.left = slotRect.left + 'px';
        this.draggedCard.style.top = slotRect.top + 'px';
        this.draggedCard.style.width = slotRect.width + 'px';
        this.draggedCard.style.height = slotRect.height + 'px';

        document.body.appendChild(this.draggedCard);

        // 高亮出牌区
        document.getElementById('play-zone').classList.add('active');

        this.updateHandUI();
    }

    onDrag(e) {
        if (!this.isDragging || !this.draggedCard) return;

        e.preventDefault();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        // 更新拖动卡牌位置
        this.draggedCard.style.left = (clientX - this.draggedCard.offsetWidth / 2) + 'px';
        this.draggedCard.style.top = (clientY - this.draggedCard.offsetHeight / 2) + 'px';

        // 检查是否在出牌区上方
        const playZone = document.getElementById('play-zone');
        const playRect = playZone.getBoundingClientRect();

        if (clientY >= playRect.top && clientY <= playRect.bottom &&
            clientX >= playRect.left && clientX <= playRect.right) {
            // 计算吸附到哪个列（基于出牌区的格子）
            const gridEl = document.getElementById('play-area-grid');
            const gridRect = gridEl.getBoundingClientRect();
            const colWidth = gridRect.width / this.cols;
            const relativeX = clientX - gridRect.left;
            const col = Math.floor(relativeX / colWidth);

            if (col >= 0 && col < this.cols) {
                this.currentCol = col;
                // 高亮出牌区的对应格子
                this.highlightPlayAreaCell(col);
            }
        } else {
            this.currentCol = -1;
            this.clearPlayAreaHighlight();
        }
    }

    highlightPlayAreaCell(col) {
        // 清除之前的高亮
        this.clearPlayAreaHighlight();
        // 高亮当前格子
        const cells = document.querySelectorAll('.play-area-cell');
        if (cells[col]) {
            cells[col].classList.add('highlight');
        }
    }

    clearPlayAreaHighlight() {
        document.querySelectorAll('.play-area-cell').forEach(cell => {
            cell.classList.remove('highlight');
        });
    }

    async endDrag(e) {
        if (!this.isDragging) return;

        this.isDragging = false;
        document.getElementById('play-zone').classList.remove('active');
        this.clearPlayAreaHighlight();

        if (this.currentCol >= 0 && this.currentCol < this.cols) {
            // 可以插入任意列（包括满列，满列时最上面的牌会被挤出）
            await this.insertCard(this.currentCol);
        }

        this.clearDragElements();
        this.currentCol = -1;
    }

    clearDragElements() {
        if (this.draggedCard) {
            this.draggedCard.remove();
            this.draggedCard = null;
        }
    }

    async insertCard(col) {
        if (this.selectedHandIndex === -1 || !this.hand[this.selectedHandIndex]) return;

        const bottomRow = this.getBottomRow(col);

        this.saveHistory();

        const card = this.hand[this.selectedHandIndex];

        // 如果是彩虹牌，需要选择颜色
        let finalColor = card.color;
        if (card.color === 'rainbow') {
            const selectedColor = await this.showColorPicker();
            if (!selectedColor) {
                // 用户取消选择，恢复手牌
                this.selectedHandIndex = -1;
                this.clearDragElements();
                return;
            }
            finalColor = selectedColor;
        }

        // 获取出牌区位置作为动画起始点
        const playAreaCell = document.querySelectorAll('.play-area-cell')[col];
        const startRect = playAreaCell.getBoundingClientRect();

        // 获取目标位置（牌堆最底部）
        const cells = document.querySelectorAll('.cell');
        const targetIndex = (this.rows - 1) * this.cols + col;
        const targetRect = cells[targetIndex].getBoundingClientRect();

        // 1. 先执行列上移动画（为插入腾出空间），保持上移状态
        const animElements = await this.animateColumnShiftUp(col, bottomRow);

        // 停顿一下
        await this.delay(100);

        // 2. 再执行出牌动画（从出牌区移动到牌堆底部）
        const playCardAnim = await this.animatePlayCard(startRect, targetRect, finalColor);

        // 停顿一下
        await this.delay(100);

        // 3. 清理列上移动画和出牌动画
        this.clearColumnShiftAnimation(animElements);
        if (playCardAnim) playCardAnim.remove();

        // 数据操作：该列上移并插入新牌
        this.shiftColumnUp(col);
        this.board[this.rows - 1][col] = finalColor;

        // 清空手牌槽位
        this.hand[this.selectedHandIndex] = null;
        this.selectedHandIndex = -1;

        this.updateHandUI();
        this.renderBoard();
        this.updateUI();

        // 停顿一下再判断消除
        await this.delay(150);
        this.processElimination();
    }

    // 列上移动画
    animateColumnShiftUp(col, bottomRow) {
        return new Promise(resolve => {
            const cells = document.querySelectorAll('.cell');
            const animElements = [];

            // 获取该列所有有牌的格子（从底部到顶部）
            for (let r = bottomRow; r >= 0; r--) {
                const cellIndex = r * this.cols + col;
                const cell = cells[cellIndex];
                if (!cell.classList.contains('empty')) {
                    const rect = cell.getBoundingClientRect();
                    // 创建动画元素
                    const animCard = document.createElement('div');
                    animCard.className = cell.className;
                    animCard.style.position = 'fixed';
                    animCard.style.zIndex = '999';
                    animCard.style.pointerEvents = 'none';
                    animCard.style.left = rect.left + 'px';
                    animCard.style.top = rect.top + 'px';
                    animCard.style.width = rect.width + 'px';
                    animCard.style.height = rect.height + 'px';
                    animCard.style.transition = 'none';
                    document.body.appendChild(animCard);
                    animElements.push({ el: animCard, fromR: r });

                    // 隐藏原格子
                    cell.style.opacity = '0';
                }
            }

            // 强制重绘
            animElements.forEach(({ el }) => el.offsetHeight);

            // 开始上移动画
            setTimeout(() => {
                animElements.forEach(({ el }) => {
                    el.style.transition = 'all 0.2s ease-out';
                    el.style.transform = 'translateY(-49px)';
                });
            }, 10);

            // 动画结束后保持状态，不移除动画元素
            setTimeout(() => {
                // 返回动画元素数组，供后续清理
                resolve(animElements);
            }, 220);
        });
    }

    // 清理列上移动画元素
    clearColumnShiftAnimation(animElements) {
        if (animElements) {
            animElements.forEach(({ el }) => el.remove());
        }
        // 恢复所有格子的透明度
        document.querySelectorAll('.cell').forEach(cell => cell.style.opacity = '');
    }

    showColorPicker() {
        return new Promise(resolve => {
            // 创建颜色选择弹窗
            const picker = document.createElement('div');
            picker.className = 'color-picker-overlay';
            picker.innerHTML = `
                <div class="color-picker-content">
                    <div class="color-picker-title">选择彩虹牌颜色</div>
                    <div class="color-picker-options">
                        <div class="color-option" data-color="1" style="background: linear-gradient(135deg, #ffb3ba 0%, #ff8a95 50%, #ff6b7a 100%);"></div>
                        <div class="color-option" data-color="2" style="background: linear-gradient(135deg, #ffd8b1 0%, #ffc48c 50%, #ffb366 100%);"></div>
                        <div class="color-option" data-color="3" style="background: linear-gradient(135deg, #ffffba 0%, #ffff8f 50%, #ffff6b 100%);"></div>
                        <div class="color-option" data-color="4" style="background: linear-gradient(135deg, #baffc9 0%, #8cffa3 50%, #6bff8a 100%);"></div>
                        <div class="color-option" data-color="5" style="background: linear-gradient(135deg, #bae1ff 0%, #8fceff 50%, #6bbfff 100%);"></div>
                        <div class="color-option" data-color="6" style="background: linear-gradient(135deg, #e2baff 0%, #d48cff 50%, #c76bff 100%);"></div>
                        <div class="color-option" data-color="7" style="background: linear-gradient(135deg, #c9c9ff 0%, #a8a8ff 50%, #8787ff 100%);"></div>
                    </div>
                    <button class="color-picker-cancel">取消</button>
                </div>
            `;
            document.body.appendChild(picker);

            // 绑定颜色选择事件
            picker.querySelectorAll('.color-option').forEach(option => {
                option.addEventListener('click', () => {
                    const color = option.dataset.color;
                    picker.remove();
                    resolve(parseInt(color));
                });
            });

            // 绑定取消事件
            picker.querySelector('.color-picker-cancel').addEventListener('click', () => {
                picker.remove();
                resolve(null);
            });

            // 点击背景取消
            picker.addEventListener('click', (e) => {
                if (e.target === picker) {
                    picker.remove();
                    resolve(null);
                }
            });
        });
    }

    animatePlayCard(startRect, targetRect, color) {
        return new Promise(resolve => {
            const animCard = document.createElement('div');
            animCard.className = `cell color-${color}`;
            animCard.style.position = 'fixed';
            animCard.style.zIndex = '1000';
            animCard.style.pointerEvents = 'none';
            // 从出牌区位置开始
            animCard.style.left = startRect.left + 'px';
            animCard.style.top = startRect.top + 'px';
            animCard.style.width = startRect.width + 'px';
            animCard.style.height = startRect.height + 'px';
            animCard.style.opacity = '0.9';
            animCard.style.transform = 'scale(1)';
            animCard.style.transition = 'none';
            document.body.appendChild(animCard);

            // 强制重绘
            animCard.offsetHeight;

            // 开始动画 - 直线移动到牌堆位置
            animCard.style.transition = 'all 0.25s ease-out';
            animCard.style.left = targetRect.left + 'px';
            animCard.style.top = targetRect.top + 'px';

            // 动画结束后不移除，保持显示
            setTimeout(() => {
                resolve(animCard);
            }, 250);
        });
    }

    shiftColumnDown(col) {
        const column = [];
        for (let r = this.rows - 1; r >= 0; r--) {
            if (this.board[r][col] !== null) column.push(this.board[r][col]);
        }

        for (let r = this.rows - 1; r >= 0; r--) {
            const idx = this.rows - 1 - r;
            this.board[r][col] = idx < column.length ? column[idx] : null;
        }
    }

    shiftColumnUp(col) {
        for (let r = 0; r < this.rows - 1; r++) {
            this.board[r][col] = this.board[r + 1][col];
        }
        this.board[this.rows - 1][col] = null;
    }

    async processElimination(isInitial = false, maxGroups = Infinity) {
        this.isProcessing = true;
        let eliminatedGroups = 0;

        while (true) {
            // 只找最下面的一组匹配
            const match = this.findBottomMatch();
            if (!match) break;

            // 开局自动消除限制组数
            if (isInitial && eliminatedGroups >= maxGroups) {
                break;
            }

            // 计算得分和能量
            const eliminatedCount = match.length;
            this.score += eliminatedCount * 10;
            this.energy += Math.floor(eliminatedCount * this.modeConfig.restorePerBlock);

            // 播放消除动画
            await this.animateElimination([match]);

            // 停顿一下
            await this.delay(150);

            // 清空这组匹配的数据
            match.forEach(({r, c}) => this.board[r][c] = null);

            // 下落补齐动画
            await this.animateColumnDown(match);

            // 数据下落
            const affectedCols = new Set(match.map(({c}) => c));
            affectedCols.forEach(c => this.shiftColumnDown(c));

            this.renderBoard();
            this.updateUI();

            // 停顿一下再判断下一组
            await this.delay(200);

            eliminatedGroups++;
        }

        this.isProcessing = false;
        this.checkGameEnd();
    }

    // 找到最下面的一组匹配
    findBottomMatch() {
        const visited = new Set();
        let bottomMatch = null;
        let bottomRow = -1;

        for (let r = this.rows - 1; r >= 0; r--) {
            for (let c = 0; c < this.cols; c++) {
                const key = `${r},${c}`;
                if (visited.has(key) || !this.board[r] || this.board[r][c] === null) continue;

                const color = this.board[r][c];

                // 彩虹牌不自动消除
                if (color === 'rainbow') continue;

                const group = [];
                const queue = [{r, c}];
                visited.add(key);

                while (queue.length > 0) {
                    const {r: cr, c: cc} = queue.shift();
                    group.push({r: cr, c: cc});

                    const neighbors = [{r: cr, c: cc - 1}, {r: cr, c: cc + 1}];

                    for (const {r: nr, c: nc} of neighbors) {
                        if (nc >= 0 && nc < this.cols && this.board[nr] && this.board[nr][nc] !== null) {
                            const nKey = `${nr},${nc}`;
                            const neighborColor = this.board[nr][nc];

                            // 彩虹牌不参与自动匹配
                            if (neighborColor === 'rainbow') continue;

                            if (!visited.has(nKey) && this.canMatch(color, neighborColor)) {
                                visited.add(nKey);
                                queue.push({r: nr, c: nc});
                            }
                        }
                    }
                }

                // 如果找到匹配且这组的位置更靠下，记录下来
                if (group.length >= 2) {
                    const groupBottomRow = Math.max(...group.map(({r}) => r));
                    if (groupBottomRow > bottomRow) {
                        bottomRow = groupBottomRow;
                        bottomMatch = group;
                    }
                }
            }
        }

        return bottomMatch;
    }

    // 列下落动画
    async animateColumnDown(match) {
        const affectedCols = new Set(match.map(({c}) => c));
        const cells = document.querySelectorAll('.cell');
        const animElements = [];

        // 为受影响的列创建下落动画
        affectedCols.forEach(col => {
            // 找到该列消除位置的最高行
            const eliminatedRows = match.filter(({c}) => c === col).map(({r}) => r);
            const topEliminatedRow = Math.min(...eliminatedRows);

            // 只获取消除位置上方有牌的格子（这些才需要下落）
            for (let r = 0; r < topEliminatedRow; r++) {
                const cellIndex = r * this.cols + col;
                const cell = cells[cellIndex];
                if (!cell.classList.contains('empty')) {
                    const rect = cell.getBoundingClientRect();
                    const animCard = document.createElement('div');
                    animCard.className = cell.className;
                    animCard.style.position = 'fixed';
                    animCard.style.zIndex = '998';
                    animCard.style.pointerEvents = 'none';
                    animCard.style.left = rect.left + 'px';
                    animCard.style.top = rect.top + 'px';
                    animCard.style.width = rect.width + 'px';
                    animCard.style.height = rect.height + 'px';
                    animCard.style.transition = 'none';
                    document.body.appendChild(animCard);
                    animElements.push(animCard);

                    // 隐藏原格子
                    cell.style.opacity = '0';
                }
            }
        });

        if (animElements.length === 0) return;

        // 强制重绘
        animElements.forEach(el => el.offsetHeight);

        // 开始下落动画
        return new Promise(resolve => {
            setTimeout(() => {
                animElements.forEach(el => {
                    el.style.transition = 'all 0.15s ease-in';
                    // 下落一格
                    el.style.transform = 'translateY(46px)';
                });
            }, 10);

            setTimeout(() => {
                animElements.forEach(el => el.remove());
                cells.forEach(cell => cell.style.opacity = '');
                resolve();
            }, 170);
        });
    }

    animateElimination(matches) {
        return new Promise(resolve => {
            const cells = document.querySelectorAll('.cell');
            let maxDelay = 0;

            matches.forEach((match, matchIndex) => {
                match.forEach(({r, c}, cardIndex) => {
                    const cellIndex = r * this.cols + c;
                    const cell = cells[cellIndex];
                    if (cell) {
                        const delay = (matchIndex * 100) + (cardIndex * 50);
                        maxDelay = Math.max(maxDelay, delay + 400);
                        setTimeout(() => {
                            cell.classList.add('eliminating');
                        }, delay);
                    }
                });
            });

            setTimeout(resolve, maxDelay);
        });
    }

    findMatches() {
        const visited = new Set();
        const matches = [];

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const key = `${r},${c}`;
                if (visited.has(key) || !this.board[r] || this.board[r][c] === null) continue;

                const color = this.board[r][c];

                // 彩虹牌永远不自动消除
                if (color === 'rainbow') continue;

                const group = [];
                const queue = [{r, c}];
                visited.add(key);

                while (queue.length > 0) {
                    const {r: cr, c: cc} = queue.shift();
                    group.push({r: cr, c: cc});

                    const neighbors = [{r: cr, c: cc - 1}, {r: cr, c: cc + 1}];

                    for (const {r: nr, c: nc} of neighbors) {
                        if (nc >= 0 && nc < this.cols && this.board[nr] && this.board[nr][nc] !== null) {
                            const nKey = `${nr},${nc}`;
                            const neighborColor = this.board[nr][nc];

                            // 彩虹牌不参与自动匹配
                            if (neighborColor === 'rainbow') continue;

                            if (!visited.has(nKey) && this.canMatch(color, neighborColor)) {
                                visited.add(nKey);
                                queue.push({r: nr, c: nc});
                            }
                        }
                    }
                }

                if (group.length >= 2) matches.push(group);
            }
        }

        return matches;
    }

    canMatch(color1, color2) {
        if (color1 === null || color2 === null) return false;
        // 自动消除时，彩虹牌不能匹配（彩虹牌只能由玩家主动打出时消除）
        if (color1 === 'rainbow' || color2 === 'rainbow') return false;
        return color1 === color2;
    }

    updateHandUI() {
        document.querySelectorAll('.hand-slot').forEach((slot, index) => {
            slot.innerHTML = '';
            slot.classList.remove('selected');

            if (this.hand[index]) {
                const cell = document.createElement('div');
                cell.className = `cell color-${this.hand[index].color}`;
                slot.appendChild(cell);
            }

            if (this.selectedHandIndex === index && this.isDragging) {
                slot.classList.add('selected');
            }
        });
    }

    showMessage(msg) {
        const text = document.createElement('div');
        text.className = 'message-text';
        text.textContent = msg;
        text.style.left = '50%';
        text.style.top = '50%';
        text.style.transform = 'translate(-50%, -50%)';
        document.body.appendChild(text);

        setTimeout(() => text.remove(), 1500);
    }

    saveHistory() {
        if (this.history.length >= 10) this.history.shift();
        this.history.push({
            board: this.board.map(row => [...row]),
            hand: [...this.hand],
            score: this.score,
            energy: this.energy
        });
        document.getElementById('undo-btn').disabled = false;
    }

    undo() {
        if (this.history.length === 0) return;
        const state = this.history.pop();
        this.board = state.board;
        this.hand = state.hand;
        this.score = state.score;
        this.energy = state.energy;
        this.selectedHandIndex = -1;
        this.clearDragElements();
        this.renderBoard();
        this.updateHandUI();
        this.updateUI();
        if (this.history.length === 0) document.getElementById('undo-btn').disabled = true;
    }

    checkGameEnd() {
        // 检查是否还有手牌，有手牌时不能结束游戏
        const hasHandCards = this.hand.some(h => h !== null);
        if (hasHandCards) {
            return;
        }

        let hasBlocks = false;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.board[r] && this.board[r][c] !== null) {
                    hasBlocks = true;
                    break;
                }
            }
        }

        if (!hasBlocks) {
            this.endGame(true);
            return;
        }

        if (this.isDeadEnd()) {
            // 失败时延迟2秒，让玩家看看局面
            this.showMessage('游戏结束！');
            setTimeout(() => this.endGame(false), 2000);
        }
    }

    isDeadEnd() {
        // 手牌不为空时不是死局
        const hasHandCards = this.hand.some(h => h !== null);
        if (hasHandCards) {
            return false;
        }

        let canDraw = false;
        for (let c = 0; c < this.cols; c++) {
            if (this.getBottomRow(c) >= 0) {
                canDraw = true;
                break;
            }
        }

        // 没有手牌且不能抽牌时才是死局
        if (!canDraw) {
            return true;
        }

        // 没有能量且没有手牌也是死局
        if (this.energy < this.modeConfig.drawCost) {
            return true;
        }

        return false;
    }

    endGame(isWin) {
        document.getElementById('result-icon').textContent = isWin ? '🏆' : '💔';
        document.getElementById('result-title').textContent = isWin ? '胜利!' : '失败';
        document.getElementById('result-title').style.color = isWin ? '#00d9ff' : '#e94560';
        document.getElementById('final-score').textContent = this.score;
        document.getElementById('result-stat-value').textContent = this.energy;

        let stars = isWin ? 3 : 0;
        document.getElementById('star-rating').innerHTML = '';
        for (let i = 0; i < 3; i++) {
            const star = document.createElement('span');
            star.className = 'star' + (i < stars ? ' active' : '');
            star.textContent = '⭐';
            document.getElementById('star-rating').appendChild(star);
        }

        this.showScreen('result-screen');
    }

    pauseGame() {
        document.getElementById('pause-screen').classList.add('active');
    }

    resumeGame() {
        document.getElementById('pause-screen').classList.remove('active');
    }

    restartGame() {
        this.startGame();
    }

    updateUI() {
        document.getElementById('score').textContent = this.score;
        document.getElementById('mode-stat-value').textContent = this.energy;
        document.getElementById('mode-stat-value').style.color = this.energy < this.modeConfig.drawCost ? '#e94560' : '#00d9ff';
    }

    showHint() {
        const matches = this.findMatches();
        if (matches.length > 0) {
            const cells = document.querySelectorAll('.cell');
            matches[0].forEach(({r, c}) => {
                cells[r * this.cols + c].classList.add('hint-pulse');
                setTimeout(() => cells[r * this.cols + c].classList.remove('hint-pulse'), 2000);
            });
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 游戏教程和引导系统
class GameTutorial {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 4;
        this.guideSteps = [
            {
                element: '.game-board-container',
                text: '点击牌堆最下方的卡牌，将其加入你的手牌',
                position: 'bottom'
            },
            {
                element: '.hand-area',
                text: '手牌会显示在这里，你可以拖动它们到出牌区',
                position: 'top'
            },
            {
                element: '.play-area',
                text: '将卡牌拖动到这里，插入任意列的底部',
                position: 'top'
            },
            {
                element: '.stats',
                text: '注意你的能量值，抽牌会消耗能量，消除会恢复能量',
                position: 'bottom'
            }
        ];
        this.currentGuideStep = 0;
        this.init();
    }

    init() {
        this.bindTutorialEvents();
        this.checkFirstTimeUser();
    }

    bindTutorialEvents() {
        // 教程入口按钮
        const tutorialBtn = document.getElementById('tutorial-btn');
        if (tutorialBtn) {
            tutorialBtn.addEventListener('click', () => this.showTutorial());
        }

        // 教程导航按钮
        const prevBtn = document.getElementById('tutorial-prev');
        const nextBtn = document.getElementById('tutorial-next');
        const closeBtn = document.getElementById('tutorial-close');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.prevStep());
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextStep());
        }
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeTutorial());
        }

        // 引导下一步按钮
        const guideNextBtn = document.querySelector('.guide-next-btn');
        if (guideNextBtn) {
            guideNextBtn.addEventListener('click', () => this.nextGuideStep());
        }
    }

    checkFirstTimeUser() {
        const hasSeenTutorial = localStorage.getItem('cardPushTutorialSeen');
        if (!hasSeenTutorial) {
            // 首次用户，标记为已看过教程
            localStorage.setItem('cardPushTutorialSeen', 'true');
        }
    }

    showTutorial() {
        this.currentStep = 1;
        this.updateTutorialUI();
        document.getElementById('tutorial-screen').classList.add('active');
    }

    closeTutorial() {
        document.getElementById('tutorial-screen').classList.remove('active');
    }

    nextStep() {
        if (this.currentStep < this.totalSteps) {
            this.currentStep++;
            this.updateTutorialUI();
        } else {
            this.closeTutorial();
        }
    }

    prevStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateTutorialUI();
        }
    }

    updateTutorialUI() {
        // 更新步骤显示
        document.querySelectorAll('.tutorial-step').forEach((step, index) => {
            step.classList.toggle('active', index + 1 === this.currentStep);
        });

        // 更新导航点
        document.querySelectorAll('.dot').forEach((dot, index) => {
            dot.classList.toggle('active', index + 1 === this.currentStep);
        });

        // 更新按钮状态
        const prevBtn = document.getElementById('tutorial-prev');
        const nextBtn = document.getElementById('tutorial-next');

        if (prevBtn) {
            prevBtn.disabled = this.currentStep === 1;
        }
        if (nextBtn) {
            nextBtn.textContent = this.currentStep === this.totalSteps ? '开始游戏' : '下一步';
        }
    }

    // 首次游戏引导
    startFirstTimeGuide() {
        const hasSeenGuide = localStorage.getItem('cardPushGuideSeen');
        if (hasSeenGuide) return;

        this.currentGuideStep = 0;
        this.showGuideStep();
    }

    showGuideStep() {
        const overlay = document.getElementById('first-time-guide');
        const tooltip = document.getElementById('guide-tooltip');
        const highlight = document.querySelector('.guide-highlight');

        if (this.currentGuideStep >= this.guideSteps.length) {
            this.endGuide();
            return;
        }

        const step = this.guideSteps[this.currentGuideStep];
        const targetEl = document.querySelector(step.element);

        if (!targetEl) {
            this.nextGuideStep();
            return;
        }

        // 显示遮罩
        overlay.classList.add('active');

        // 设置高亮区域
        const rect = targetEl.getBoundingClientRect();
        highlight.style.left = (rect.left - 8) + 'px';
        highlight.style.top = (rect.top - 8) + 'px';
        highlight.style.width = (rect.width + 16) + 'px';
        highlight.style.height = (rect.height + 16) + 'px';

        // 设置提示文本
        const textEl = tooltip.querySelector('.guide-text');
        textEl.textContent = step.text;

        // 设置提示位置
        tooltip.className = 'guide-tooltip ' + step.position;

        // 计算提示位置
        let tooltipLeft, tooltipTop;
        const tooltipRect = tooltip.getBoundingClientRect();

        switch (step.position) {
            case 'top':
                tooltipLeft = rect.left + rect.width / 2 - tooltipRect.width / 2;
                tooltipTop = rect.top - tooltipRect.height - 16;
                break;
            case 'bottom':
                tooltipLeft = rect.left + rect.width / 2 - tooltipRect.width / 2;
                tooltipTop = rect.bottom + 16;
                break;
            case 'left':
                tooltipLeft = rect.left - tooltipRect.width - 16;
                tooltipTop = rect.top + rect.height / 2 - tooltipRect.height / 2;
                break;
            case 'right':
                tooltipLeft = rect.right + 16;
                tooltipTop = rect.top + rect.height / 2 - tooltipRect.height / 2;
                break;
        }

        // 边界检查
        tooltipLeft = Math.max(10, Math.min(tooltipLeft, window.innerWidth - tooltipRect.width - 10));
        tooltipTop = Math.max(10, Math.min(tooltipTop, window.innerHeight - tooltipRect.height - 10));

        tooltip.style.left = tooltipLeft + 'px';
        tooltip.style.top = tooltipTop + 'px';

        // 更新按钮文本
        const nextBtn = tooltip.querySelector('.guide-next-btn');
        nextBtn.textContent = this.currentGuideStep === this.guideSteps.length - 1 ? '开始游戏' : '下一步';
    }

    nextGuideStep() {
        this.currentGuideStep++;
        if (this.currentGuideStep >= this.guideSteps.length) {
            this.endGuide();
        } else {
            this.showGuideStep();
        }
    }

    endGuide() {
        const overlay = document.getElementById('first-time-guide');
        overlay.classList.remove('active');
        localStorage.setItem('cardPushGuideSeen', 'true');
    }

    // 显示游戏提示
    showGameHint(message, duration = 2000) {
        let hintEl = document.querySelector('.game-hint');
        if (!hintEl) {
            hintEl = document.createElement('div');
            hintEl.className = 'game-hint';
            document.body.appendChild(hintEl);
        }

        hintEl.textContent = message;
        hintEl.classList.add('show');

        setTimeout(() => {
            hintEl.classList.remove('show');
        }, duration);
    }
}

// 初始化游戏和教程
const game = new CardPushGame();
const tutorial = new GameTutorial();

// 在游戏开始时检查是否需要显示引导
const originalStartGame = game.startGame.bind(game);
game.startGame = async function() {
    await originalStartGame();
    // 延迟显示引导，等待界面渲染完成
    setTimeout(() => {
        tutorial.startFirstTimeGuide();
    }, 500);
};
