class Calculator {
    constructor(previousOperandEl, currentOperandEl) {
        this.previousOperandEl = previousOperandEl;
        this.currentOperandEl = currentOperandEl;
        this.clear();
    }

    clear() {
        this.currentOperand = '0';
        this.previousOperand = '';
        this.operation = undefined;
        this.shouldResetDisplay = false;
    }

    delete() {
        if (this.shouldResetDisplay) return;
        if (this.currentOperand.length === 1) {
            this.currentOperand = '0';
        } else {
            this.currentOperand = this.currentOperand.slice(0, -1);
        }
    }

    appendNumber(value) {
        if (this.shouldResetDisplay) {
            this.currentOperand = '0';
            this.shouldResetDisplay = false;
        }
        if (value === '.' && this.currentOperand.includes('.')) return;
        if (this.currentOperand === '0' && value !== '.') {
            this.currentOperand = value;
        } else {
            this.currentOperand += value;
        }
    }

    chooseOperation(operation) {
        if (this.currentOperand === '' && this.previousOperand === '') return;
        if (this.previousOperand !== '' && !this.shouldResetDisplay) {
            this.compute();
        }
        this.operation = operation;
        this.previousOperand = this.currentOperand;
        this.shouldResetDisplay = true;
    }

    percent() {
        const current = parseFloat(this.currentOperand);
        if (isNaN(current)) return;
        this.currentOperand = String(current / 100);
    }

    compute() {
        let computation;
        const prev = parseFloat(this.previousOperand);
        const current = parseFloat(this.currentOperand);
        if (isNaN(prev) || isNaN(current)) return;
        switch (this.operation) {
            case '+':
                computation = prev + current;
                break;
            case '−':
                computation = prev - current;
                break;
            case '×':
                computation = prev * current;
                break;
            case '÷':
                if (current === 0) {
                    this.currentOperand = 'エラー';
                    this.previousOperand = '';
                    this.operation = undefined;
                    this.shouldResetDisplay = true;
                    return;
                }
                computation = prev / current;
                break;
            default:
                return;
        }
        this.currentOperand = this.formatResult(computation);
        this.operation = undefined;
        this.previousOperand = '';
        this.shouldResetDisplay = true;
    }

    formatResult(num) {
        if (!isFinite(num)) return 'エラー';
        const rounded = Math.round(num * 1e10) / 1e10;
        return String(rounded);
    }

    getDisplayNumber(numberStr) {
        if (numberStr === 'エラー') return numberStr;
        if (numberStr === '' || numberStr === undefined) return '';
        const [integerPart, decimalPart] = numberStr.split('.');
        const intNum = parseFloat(integerPart);
        let integerDisplay;
        if (isNaN(intNum)) {
            integerDisplay = '';
        } else {
            integerDisplay = intNum.toLocaleString('en', { maximumFractionDigits: 0 });
        }
        return decimalPart != null ? `${integerDisplay}.${decimalPart}` : integerDisplay;
    }

    updateDisplay() {
        this.currentOperandEl.textContent = this.getDisplayNumber(this.currentOperand);
        if (this.operation != null) {
            this.previousOperandEl.textContent =
                `${this.getDisplayNumber(this.previousOperand)} ${this.operation}`;
        } else {
            this.previousOperandEl.textContent = '';
        }
    }
}

const previousOperandEl = document.getElementById('previousOperand');
const currentOperandEl = document.getElementById('currentOperand');
const calculator = new Calculator(previousOperandEl, currentOperandEl);

document.querySelectorAll('.btn').forEach(button => {
    button.addEventListener('click', () => {
        const action = button.dataset.action;
        const value = button.dataset.value;
        switch (action) {
            case 'number':
                calculator.appendNumber(value);
                break;
            case 'operator':
                calculator.chooseOperation(value);
                break;
            case 'equals':
                calculator.compute();
                break;
            case 'clear':
                calculator.clear();
                break;
            case 'delete':
                calculator.delete();
                break;
            case 'percent':
                calculator.percent();
                break;
        }
        calculator.updateDisplay();
    });
});

document.addEventListener('keydown', (e) => {
    if (/^[0-9]$/.test(e.key)) {
        calculator.appendNumber(e.key);
    } else if (e.key === '.') {
        calculator.appendNumber('.');
    } else if (e.key === '+') {
        calculator.chooseOperation('+');
    } else if (e.key === '-') {
        calculator.chooseOperation('−');
    } else if (e.key === '*') {
        calculator.chooseOperation('×');
    } else if (e.key === '/') {
        e.preventDefault();
        calculator.chooseOperation('÷');
    } else if (e.key === '%') {
        calculator.percent();
    } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        calculator.compute();
    } else if (e.key === 'Backspace') {
        calculator.delete();
    } else if (e.key === 'Escape') {
        calculator.clear();
    } else {
        return;
    }
    calculator.updateDisplay();
});

calculator.updateDisplay();
