const COLUMNS = 100;
const ROWS = 100;
const LEGACY_COLUMNS = 50;
const PRICE_PER_CELL = 20000;
const STORAGE_KEY = "ruangpixel-ads-v1";

const board = document.querySelector("#pixel-board");
const form = document.querySelector("#ad-form");
const selectedCount = document.querySelector("#selected-count");
const totalPrice = document.querySelector("#total-price");
const message = document.querySelector("#form-message");
const submitButton = document.querySelector("#submit-ad");

const selectedCells = new Set();
let ads = loadAds();

function formatRupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function safeWebsiteUrl(value) {
  try {
    const trimmedValue = value.trim();
    const address = /^https?:\/\//i.test(trimmedValue)
      ? trimmedValue
      : `https://${trimmedValue}`;
    const url = new URL(address);
    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
}

function loadAds() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(saved)) {
      throw new Error("Saved ad data is invalid.");
    }
    const validAds = saved.filter(
      (ad) =>
        ad &&
        typeof ad.id === "string" &&
        typeof ad.name === "string" &&
        typeof ad.image === "string" &&
        ad.image.startsWith("data:image/") &&
        safeWebsiteUrl(ad.url) &&
        Array.isArray(ad.cells) &&
        ad.cells.length > 0 &&
        ad.cells.every(
          (cell) => Number.isInteger(cell) && cell >= 0 && cell < COLUMNS * ROWS,
        ),
    );
    let migrated = false;
    for (const ad of validAds) {
      if (!Number.isInteger(ad.gridColumns)) {
        ad.cells = ad.cells.map(
          (cell) => Math.floor(cell / LEGACY_COLUMNS) * COLUMNS + (cell % LEGACY_COLUMNS),
        );
        ad.gridColumns = COLUMNS;
        migrated = true;
      }
    }
    if (migrated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validAds));
    }
    return validAds;
  } catch (error) {
    window.setTimeout(() => {
      showMessage(`Could not read saved ads: ${error.message}`, true);
    }, 0);
    return [];
  }
}

function renderBoard() {
  board.replaceChildren();
  const occupiedCells = new Map();

  for (const ad of ads) {
    const adCells = ad.cells.map((cell) => ({
      index: cell,
      row: Math.floor(cell / COLUMNS),
      column: cell % COLUMNS,
    }));
    const minRow = Math.min(...adCells.map((cell) => cell.row));
    const maxRow = Math.max(...adCells.map((cell) => cell.row));
    const minColumn = Math.min(...adCells.map((cell) => cell.column));
    const maxColumn = Math.max(...adCells.map((cell) => cell.column));

    for (const cell of adCells) {
      occupiedCells.set(cell.index, {
        ad,
        row: cell.row,
        column: cell.column,
        minRow,
        minColumn,
        adWidth: maxColumn - minColumn + 1,
        adHeight: maxRow - minRow + 1,
      });
    }
  }

  for (let cellIndex = 0; cellIndex < COLUMNS * ROWS; cellIndex += 1) {
    const occupied = occupiedCells.get(cellIndex);

    if (occupied) {
      const { ad, row, column, minRow, minColumn, adWidth, adHeight } = occupied;
      const link = safeWebsiteUrl(ad.url);
      if (!link) {
        continue;
      }

      const linkCell = document.createElement("a");

      linkCell.className = "pixel-cell";
      linkCell.href = link;
      linkCell.target = "_blank";
      linkCell.rel = "noopener noreferrer";
      linkCell.title = `${ad.name} — open website`;
      linkCell.setAttribute("aria-label", `${ad.name}, open website in a new tab`);
      linkCell.style.backgroundImage = `url("${ad.image}")`;
      linkCell.style.backgroundSize = `${adWidth * 100}% ${adHeight * 100}%`;
      linkCell.style.backgroundPosition = `${
        adWidth === 1 ? 0 : ((column - minColumn) / (adWidth - 1)) * 100
      }% ${adHeight === 1 ? 0 : ((row - minRow) / (adHeight - 1)) * 100}%`;
      board.append(linkCell);
      continue;
    }

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "pixel-cell";
    cell.dataset.cellIndex = String(cellIndex);
    cell.setAttribute("aria-label", `Square ${cellIndex + 1}, available`);
    cell.setAttribute("aria-pressed", String(selectedCells.has(cellIndex)));
    if (selectedCells.has(cellIndex)) {
      cell.classList.add("is-selected");
    }
    board.append(cell);
  }

  board.onclick = (event) => {
    const cell = event.target.closest("button.pixel-cell");
    if (cell && board.contains(cell)) {
      const cellIndex = Number(cell.dataset.cellIndex);
      if (Number.isInteger(cellIndex)) {
        toggleCell(cellIndex);
      }
    }
  };
}

function renderSummary() {
  const count = selectedCells.size;
  selectedCount.textContent = String(count);
  totalPrice.textContent = formatRupiah(count * PRICE_PER_CELL);
  submitButton.disabled = count === 0;
}

function toggleCell(cellIndex) {
  if (selectedCells.has(cellIndex)) {
    selectedCells.delete(cellIndex);
  } else {
    selectedCells.add(cellIndex);
  }
  const cell = board.querySelector(`[data-cell-index="${cellIndex}"]`);
  if (cell) {
    const isSelected = selectedCells.has(cellIndex);
    cell.classList.toggle("is-selected", isSelected);
    cell.setAttribute("aria-pressed", String(isSelected));
  }
  showMessage("");
  renderSummary();
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("is-error", isError);
}

function readResizedImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("The selected file is not a valid image."));
      image.onload = () => {
        const maxDimension = 1200;
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));

        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Your browser could not process this image."));
          return;
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (selectedCells.size === 0) {
    showMessage("Select at least one available square first.", true);
    return;
  }

  const formData = new FormData(form);
  const name = String(formData.get("ad-name") || "").trim();
  const url = safeWebsiteUrl(String(formData.get("ad-url") || "").trim());
  const imageFile = formData.get("ad-image");

  if (!name || !url || !(imageFile instanceof File) || imageFile.size === 0) {
    showMessage("Enter a business name, a valid website link, and an ad image.", true);
    return;
  }

  if (!imageFile.type.startsWith("image/")) {
    showMessage("Choose a supported image file.", true);
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Processing image...";
  showMessage("");

  try {
    const image = await readResizedImage(imageFile);
    const newAd = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      url,
      image,
      gridColumns: COLUMNS,
      cells: [...selectedCells],
    };
    const nextAds = [...ads, newAd];

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAds));
    } catch (error) {
      if (error instanceof DOMException && error.name === "QuotaExceededError") {
        throw new Error("Browser storage is full. Try a smaller image.");
      }
      throw new Error(`Could not save the ad: ${error.message}`);
    }

    ads = nextAds;
    selectedCells.clear();
    form.reset();
    renderBoard();
    renderSummary();
    showMessage("Ad placed in this demo. No payment has been processed.");
  } catch (error) {
    showMessage(error.message || "Could not place the ad. Please try again.", true);
  } finally {
    submitButton.textContent = "Place ad";
    renderSummary();
  }
});

renderBoard();
renderSummary();