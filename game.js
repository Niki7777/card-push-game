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
        this.isProcessing = false;
        this.isDragging = false;
        this.draggedCard = null;
        this.currentCol = -1;
        this.currentLevel = 1;
        this.maxLevel = 20;
        this.unlockedLevel = parseInt(localStorage.getItem('pushpop_unlocked')) || 1;

        // 关卡配置
        this.levels = [
            // 1-5关: 5色 1槽 标准模式
            { colors: 5, handSlots: 1, scoreMultiplier: 1, name: '入门 1' },
            { colors: 5, handSlots: 1, scoreMultiplier: 1, name: '入门 2' },
            { colors: 5, handSlots: 1, scoreMultiplier: 1, name: '入门 3' },
            { colors: 5, handSlots: 1, scoreMultiplier: 1, name: '入门 4' },
            { colors: 5, handSlots: 1, scoreMultiplier: 1, name: '入门 5' },
            // 6-10关: 6色 2槽 消除得分翻倍
            { colors: 6, handSlots: 2, scoreMultiplier: 2, name: '进阶 1' },
            { colors: 6, handSlots: 2, scoreMultiplier: 2, name: '进阶 2' },
            { colors: 6, handSlots: 2, scoreMultiplier: 2, name: '进阶 3' },
            { colors: 6, handSlots: 2, scoreMultiplier: 2, name: '进阶 4' },
            { colors: 6, handSlots: 2, scoreMultiplier: 2, name: '进阶 5' },
            // 11-15关: 7色 2槽 每步消耗能量+5
            { colors: 7, handSlots: 2, scoreMultiplier: 1, energyCost: 5, name: '挑战 1' },
            { colors: 7, handSlots: 2, scoreMultiplier: 1, energyCost: 5, name: '挑战 2' },
            { colors: 7, handSlots: 2, scoreMultiplier: 1, energyCost: 5, name: '挑战 3' },
            { colors: 7, handSlots: 2, scoreMultiplier: 1, energyCost: 5, name: '挑战 4' },
            { colors: 7, handSlots: 2, scoreMultiplier: 1, energyCost: 5, name: '挑战 5' },
            // 16-20关: 8色 2槽
            { colors: 8, handSlots: 2, scoreMultiplier: 1, name: '大师 1' },
            { colors: 8, handSlots: 2, scoreMultiplier: 1, name: '大师 2' },
            { colors: 8, handSlots: 2, scoreMultiplier: 1, name: '大师 3' },
            { colors: 8, handSlots: 2, scoreMultiplier: 1, name: '大师 4' },
            { colors: 8, handSlots: 2, scoreMultiplier: 1, name: '大师 5' },
        ];

        this.init();
    }

    init() {
        this.bindEvents();
        this.renderLevelSelect();
        this.showScreen('main-menu');
    }

    bindEvents() {
        document.querySelector('.back-btn').addEventListener('click', () => {
            this.showScreen('main-menu');
            this.renderLevelSelect();
        });
        document.getElementById('play-again-btn').addEventListener('click', () => this.restartGame());
        document.getElementById('back-menu-btn').addEventListener('click', () => {
            this.showScreen('main-menu');
            this.renderLevelSelect();
        });

        // 全局拖动事件
        document.addEventListener('mousemove', (e) => this.onDrag(e));
        document.addEventListener('touchmove', (e) => this.onDrag(e), { passive: false });
        document.addEventListener('mouseup', (e) => this.endDrag(e));
        document.addEventListener('touchend', (e) => this.endDrag(e));
    }

    renderLevelSelect() {
        const grid = document.getElementById('level-grid');
        grid.innerHTML = '';
        
        this.levels.forEach((level, index) => {
            const levelNum = index + 1;
            const isUnlocked = levelNum <= this.unlockedLevel;
            const isCurrent = levelNum === this.currentLevel;
            
            const btn = document.createElement('button');
            btn.className = 'level-btn';
            if (isUnlocked) btn.classList.add('unlocked');
            if (isCurrent) btn.classList.add('current');
            btn.disabled = !isUnlocked;
            
            btn.innerHTML = `
                <span class="level-number">${levelNum}</span>
                <span class="level-name">${level.name}</span>
                <span class="level-status">${isUnlocked ? (isCurrent ? '●' : '○') : '🔒'}</span>
            `;
            
            btn.addEventListener('click', () => this.startGame(levelNum));
            grid.appendChild(btn);
        });
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }

    async startGame(level = 1) {
        this.currentLevel = level;
        const config = this.levels[level - 1];
        
        // 应用关卡配置
        this.colors = config.colors;
        this.hand = new Array(config.handSlots).fill(null);
        this.scoreMultiplier = config.scoreMultiplier || 1;
        this.energyCost = config.energyCost || 0;
        
        this.resetGame();
        this.generateBoard();
        this.renderBoard();
        this.renderPlayArea();
        this.updateHandSlotsUI();
        this.updateUI();
        this.showScreen('game-screen');

        // 开局自动检查消除，不限制次数，彩虹牌不参与
        await this.processElimination(true, Infinity);
    }

    resetGame() {
        this.board = [];
        this.selectedHandIndex = -1;
        this.score = 0;
        this.isProcessing = false;
        this.isDragging = false;
        this.draggedCard = null;
        this.currentCol = -1;

        this.updateHandUI();
        this.clearDragElements();
    }

    updateHandSlotsUI() {
        const container = document.querySelector('.hand-slots');
        container.innerHTML = '';
        for (let i = 0; i < this.hand.length; i++) {
            const slot = document.createElement('div');
            slot.className = 'hand-slot';
            slot.dataset.slot = i;
            slot.addEventListener('mousedown', (e) => this.startDrag(e, i));
            slot.addEventListener('touchstart', (e) => this.startDrag(e, i), { passive: false });
            container.appendChild(slot);
        }
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

        const row = this.getBottomRow(col);
        const color = this.board[row][col];

        // 检查这是否是该列最后一张牌
        const isLastCard = this.isColumnEmptyAfterDraw(col, row);

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

        // 如果该列已空，立即左移
        if (isLastCard) {
            await this.shiftColumnsLeft([col]);
        }

        this.processElimination();
    }

    // 检查抽牌后该列是否为空
    isColumnEmptyAfterDraw(col, drawRow) {
        for (let r = 0; r < drawRow; r++) {
            if (this.board[r][col] !== null) {
                return false;
            }
        }
        return true;
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

        // 获取触摸或鼠标事件的坐标
        let clientX, clientY;
        if (e.changedTouches && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        } else if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        // 检查是否在出牌区上方
        const playZone = document.getElementById('play-zone');
        const playRect = playZone.getBoundingClientRect();

        if (clientY >= playRect.top && clientY <= playRect.bottom &&
            clientX >= playRect.left && clientX <= playRect.right) {
            // 计算插入哪个列
            const gridEl = document.getElementById('play-area-grid');
            const gridRect = gridEl.getBoundingClientRect();
            const colWidth = gridRect.width / this.cols;
            const relativeX = clientX - gridRect.left;
            const col = Math.floor(relativeX / colWidth);

            if (col >= 0 && col < this.cols) {
                await this.insertCard(col);
            }
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
                    el.style.transform = 'translateY(-43px)';
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
                        <div class="color-option" data-color="1" style="background: linear-gradient(160deg, #ffcdd2 0%, #ef9a9a 50%, #e57373 100%);"></div>
                        <div class="color-option" data-color="2" style="background: linear-gradient(160deg, #ffffff 0%, #f5f5f5 50%, #e0e0e0 100%);"></div>
                        <div class="color-option" data-color="3" style="background: linear-gradient(160deg, #fff9c4 0%, #fff59d 50%, #fff176 100%);"></div>
                        <div class="color-option" data-color="4" style="background: linear-gradient(160deg, #c8e6c9 0%, #a5d6a7 50%, #81c784 100%);"></div>
                        <div class="color-option" data-color="5" style="background: linear-gradient(160deg, #b3e5fc 0%, #81d4fa 50%, #4fc3f7 100%);"></div>
                        <div class="color-option" data-color="6" style="background: linear-gradient(160deg, #d1c4e9 0%, #b39ddb 50%, #9575cd 100%);"></div>
                        <div class="color-option" data-color="7" style="background: linear-gradient(160deg, #f8bbd9 0%, #f48fb1 50%, #f06292 100%);"></div>
                    </div>
                    <button class="color-picker-cancel">取消</button>
                </div>
            `;
            document.body.appendChild(picker);

            // 绑定颜色选择事件（支持鼠标和触摸）
            picker.querySelectorAll('.color-option').forEach(option => {
                const selectColor = () => {
                    const color = option.dataset.color;
                    picker.remove();
                    resolve(parseInt(color));
                };
                option.addEventListener('click', selectColor);
                option.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    selectColor();
                }, { passive: false });
            });

            // 绑定取消事件（支持鼠标和触摸）
            const cancelBtn = picker.querySelector('.color-picker-cancel');
            const cancelPicker = () => {
                picker.remove();
                resolve(null);
            };
            cancelBtn.addEventListener('click', cancelPicker);
            cancelBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                cancelPicker();
            }, { passive: false });

            // 点击背景取消（支持鼠标和触摸）
            const bgCancel = (e) => {
                if (e.target === picker) {
                    picker.remove();
                    resolve(null);
                }
            };
            picker.addEventListener('click', bgCancel);
            picker.addEventListener('touchstart', (e) => {
                if (e.target === picker) {
                    e.preventDefault();
                    picker.remove();
                    resolve(null);
                }
            }, { passive: false });
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

            // 计算得分（应用关卡倍率）
            const eliminatedCount = match.length;
            this.score += eliminatedCount * 10 * this.scoreMultiplier;

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

            // 检查是否有空列，有则左移补齐
            const emptyCols = this.findEmptyColumns();
            if (emptyCols.length > 0) {
                await this.shiftColumnsLeft(emptyCols);
            }

            eliminatedGroups++;
        }

        this.isProcessing = false;
        this.checkGameEnd();
    }

    // 找到所有空列
    findEmptyColumns() {
        const emptyCols = [];
        for (let c = 0; c < this.cols; c++) {
            let isEmpty = true;
            for (let r = 0; r < this.rows; r++) {
                if (this.board[r][c] !== null) {
                    isEmpty = false;
                    break;
                }
            }
            if (isEmpty) emptyCols.push(c);
        }
        return emptyCols;
    }

    // 左移列补齐
    async shiftColumnsLeft(emptyCols) {
        // 从右向左处理，避免索引变化问题
        emptyCols.sort((a, b) => b - a);
        
        for (const emptyCol of emptyCols) {
            // 动画：右边的列左移
            await this.animateShiftLeft(emptyCol);
            
            // 数据左移
            for (let c = emptyCol; c < this.cols - 1; c++) {
                for (let r = 0; r < this.rows; r++) {
                    this.board[r][c] = this.board[r][c + 1];
                }
            }
            // 最右列置空
            for (let r = 0; r < this.rows; r++) {
                this.board[r][this.cols - 1] = null;
            }
        }
        
        this.renderBoard();
    }

    // 列左移动画
    async animateShiftLeft(emptyCol) {
        return new Promise(resolve => {
            const cells = document.querySelectorAll('.cell');
            const animElements = [];
            
            // 获取需要左移的列（emptyCol右边的所有列）
            for (let c = emptyCol + 1; c < this.cols; c++) {
                for (let r = 0; r < this.rows; r++) {
                    const cellIndex = r * this.cols + c;
                    const cell = cells[cellIndex];
                    if (!cell.classList.contains('empty')) {
                        const rect = cell.getBoundingClientRect();
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
                        animElements.push(animCard);
                    }
                    cell.style.opacity = '0';
                }
            }
            
            if (animElements.length === 0) {
                resolve();
                return;
            }
            
            // 强制重绘
            animElements.forEach(el => el.offsetHeight);
            
            // 开始左移动画
            setTimeout(() => {
                animElements.forEach(el => {
                    el.style.transition = 'all 0.25s ease-out';
                    el.style.transform = 'translateX(-35px)';
                });
            }, 10);
            
            // 动画结束
            setTimeout(() => {
                animElements.forEach(el => el.remove());
                cells.forEach(cell => cell.style.opacity = '');
                resolve();
            }, 260);
        });
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

        return false;
    }

    endGame(isWin) {
        const config = this.levels[this.currentLevel - 1];
        document.getElementById('result-icon').textContent = isWin ? '🏆' : '💔';
        document.getElementById('result-title').textContent = isWin ? `关卡 ${this.currentLevel} 通关!` : '失败';
        document.getElementById('result-title').style.color = isWin ? '#00d9ff' : '#e94560';
        document.getElementById('final-score').textContent = this.score;
        document.getElementById('result-stat-label').textContent = config.name;
        document.getElementById('result-stat-value').textContent = isWin ? '✓' : '✗';

        // 解锁下一关
        if (isWin && this.currentLevel < this.maxLevel) {
            const nextLevel = this.currentLevel + 1;
            if (nextLevel > this.unlockedLevel) {
                this.unlockedLevel = nextLevel;
                localStorage.setItem('pushpop_unlocked', this.unlockedLevel);
            }
        }

        // 更新按钮
        const playAgainBtn = document.getElementById('play-again-btn');
        if (isWin && this.currentLevel < this.maxLevel) {
            playAgainBtn.textContent = '下一关 →';
            playAgainBtn.onclick = () => this.startGame(this.currentLevel + 1);
        } else {
            playAgainBtn.textContent = '再玩一次';
            playAgainBtn.onclick = () => this.restartGame();
        }

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

    restartGame() {
        this.startGame(this.currentLevel);
    }

    updateUI() {
        document.getElementById('score').textContent = this.score;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

new CardPushGame();
