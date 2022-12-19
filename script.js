function onReaderLoad(event) {
  analyzeFile(event.target.result);
}

const input = document.getElementById("state_input");
const content = document.getElementById("content");

input.addEventListener("change", (evt) => {
  const reader = new FileReader();
  reader.onload = onReaderLoad;
  reader.readAsText(event.target.files[0]);
});

const renderUsersConfig = (config) => {
  const html = Object.keys(config)
    .map(
      (key) =>
        `<div class="widgets-config">
                  <div class="widgets-title">#${key}</div>
                  <div class="widgets-value">${renderWidgetConfig(
                    config[key],
                    "EMPTY"
                  )}</div>
              </div>`
    )
    .join("");
  return html;
};

const renderWidgetConfig = (config, placeholder, suffix) => {
  const html = Object.keys(config)
    .map(
      (key) =>
        `<div class="widgets-config">
                <div class="widgets-title">${key}</div>
                <div class="widgets-value">${config[key] || placeholder}</div>
            </div>`
    )
    .join("");
  return html;
};

function getTopParent(el) {
  return el.className.includes("clickable")
    ? el
    : getTopParent(el.parentElement);
}

function renderResult(result) {
  content.innerHTML = "";

  const html = Object.keys(result)
    .map((key) => {
      const isObj = typeof result[key] === "object";
      return `<div class="main-info ${isObj ? "clickable" : ""}">
                <div class="title">${key}</div>
                <div class="value">${
                  isObj
                    ? key === "multiBoardWidgetsConfigByUser"
                      ? renderUsersConfig(result[key])
                      : renderWidgetConfig(result[key])
                    : result[key]
                }</div>
            </div>`;
    })
    .join("");
  content.innerHTML = html;
  const accordeons = content.getElementsByClassName("clickable");
  for (let item of accordeons) {
    item.addEventListener("click", (evt) => {
      const parent = getTopParent(evt.target);
      if (parent.className.includes("hidden")) {
        parent.className = parent.className.replace(" hidden", "");
      } else {
        parent.className += " hidden";
      }
    });
  }
}

const MARKET_DEPTH_NAME = "marketDepth";
const CHART_NAME = "overview";

function getMedian(values) {
  values.sort(function (a, b) {
    return a - b;
  });

  var half = Math.floor(values.length / 2);

  if (values.length % 2) return values[half];

  return (values[half - 1] + values[half]) / 2.0;
}

const normalizeWlConfig = (cfg) => {
  const uniqs = cfg.reduce((acc, c) => {
    acc[c] = (acc[c] || 0) + 1; // If widget name is present adds count
    return acc;
  }, {});

  const normalizedConfig = Object.keys(uniqs).reduce((acc, key) => {
    return { ...acc, [key || "empty"]: uniqs[key] };
  }, {});

  const sortedConfig = Object.entries(normalizedConfig)
    .sort(([, a], [, b]) => b - a)
    .reduce((r, [k, v]) => ({ ...r, [k]: v }), {}); // Sort widgets config by count DESC

  return sortedConfig;
};

const round = (num) => Math.round(num * 100) / 100;

function analyzeFile(data) {
  try {
    const parsedFile = JSON.parse(data);
    const result = parsedFile.reduce(
      (acc, setting) => {
        try {
          const userId = setting.user_id;
          const parsedState = JSON.parse(setting.state);
          const { trade = {}, style = {}, tileBoard, watchlists } = parsedState;
          const isTradingLocked = trade.isTradingLocked;
          const closeConfirmation = trade.closeConfirmation;
          const colorizedQuotes = style.colorizedQuotes;
          const quickTradeEnabled = trade.quick?.enabled;
          const boardsCount = tileBoard?.boards?.length || 0;
          const wlCount = watchlists?.length || 0;
          let emptyWlCount = 0;
          let wlCountFromBoard = 0;
          let wlIds = [];
          const panels = tileBoard?.boards || [];
          let widgetsConfig = [];
          let singleBoardWidgetsConfig = [];
          let multiBoardWidgetsConfig = [];
          let multiBoardWidgetsConfigByUser = {};
          const isMultiBoard = panels?.length > 1;
          let widgetsCountForEachBoard = [];
          if (panels?.length) {
            const configs = panels.map((p) => {
              if (p.watchlists.length) {
                wlCountFromBoard = wlCountFromBoard + p.watchlists.length; // Count watchlists that present in board
                wlIds = [...wlIds, ...p.watchlists];
              }
              let widgetsCount = {};
              const widgetsOnBoard = Object.keys(p.widgets)
                .map((w) => {
                  const name = p.widgets[w].component;
                  widgetsCount[name] = (widgetsCount[name] || 0) + 1;
                  // if (name === CHART_NAME) {
                  //   const view = p.widgets[w]?.config.view || 'simple';
                  // }
                  return name;
                })
                .sort();
              widgetsCountForEachBoard = Object.keys(widgetsCount).length
                ? [...widgetsCountForEachBoard, widgetsCount]
                : widgetsCountForEachBoard;
              return _.uniq(widgetsOnBoard).join(","); // get unique widget names from board config
            });
            widgetsConfig = configs;
            if (isMultiBoard) {
              multiBoardWidgetsConfig = configs; // If board is not single add config to multiple
            } else {
              singleBoardWidgetsConfig = configs; // If board is single add config to single
            }
          }
          const normalizedWidgetsCountForEachBoard =
            widgetsCountForEachBoard.filter(Boolean);
          const instrumentsCount = watchlists?.length
            ? watchlists
                .filter((wl) => wlIds.includes(wl.id)) // Filter by wl ids that present in boards
                .reduce((acc, wl) => {
                  const isEmpty = !wl.instruments?.length;
                  if (isEmpty) {
                    emptyWlCount = emptyWlCount + 1; // Count empty watchlists
                  }
                  return acc + wl.instruments?.length || 0;
                }, 0)
            : 0;
          return {
            usersCount: acc.usersCount + 1,
            userWithNoBoard: !boardsCount
              ? acc.userWithNoBoard + 1
              : acc.userWithNoBoard,
            usersWithBoard: boardsCount
              ? acc.usersWithBoard + 1
              : acc.usersWithBoard,
            usersWithMultiBoard: isMultiBoard
              ? acc.usersWithMultiBoard + 1
              : acc.usersWithMultiBoard,
            usersWithWatchlists: wlCount
              ? acc.usersWithWatchlists + 1
              : acc.usersWithWatchlists,
            usersWithWatchlistOnBoard: wlCountFromBoard
              ? acc.usersWithWatchlistOnBoard + 1
              : acc.usersWithWatchlistOnBoard,
            emptyWlCount: emptyWlCount
              ? acc.emptyWlCount + 1
              : acc.emptyWlCount,
            isTradingLocked: isTradingLocked
              ? acc.isTradingLocked + 1
              : acc.isTradingLocked,
            closeConfirmation: closeConfirmation
              ? acc.closeConfirmation + 1
              : acc.closeConfirmation,
            colorizedQuotes: colorizedQuotes
              ? acc.colorizedQuotes + 1
              : acc.colorizedQuotes,
            quickTradeEnabled: quickTradeEnabled
              ? acc.quickTradeEnabled + 1
              : acc.quickTradeEnabled,
            boardsCount: acc.boardsCount + boardsCount,
            wlCount: acc.wlCount + wlCount,
            wlCountFromBoard: acc.wlCountFromBoard + wlCountFromBoard,
            wlCountFromBoardByUser: wlCountFromBoard // Adds value only if we have watchlists on boards for median value
              ? [...acc.wlCountFromBoardByUser, wlCountFromBoard]
              : acc.wlCountFromBoardByUser,
            instrumentsCountByUser: instrumentsCount // Adds value only if we have instruments for median value
              ? [...acc.instrumentsCountByUser, instrumentsCount]
              : acc.instrumentsCountByUser,
            instrumentsCount: acc.instrumentsCount + (instrumentsCount || 0),
            widgetsConfig: _.sortBy([...acc.widgetsConfig, ...widgetsConfig]),
            singleBoardWidgetsConfig: _.sortBy([
              ...acc.singleBoardWidgetsConfig,
              ...singleBoardWidgetsConfig,
            ]),
            multiBoardWidgetsConfig: _.sortBy([
              ...acc.multiBoardWidgetsConfig,
              ...multiBoardWidgetsConfig,
            ]),
            widgetsCountsByBoards: [
              ...acc.widgetsCountsByBoards,
              normalizedWidgetsCountForEachBoard,
            ].filter((c) => c.length),
            multiBoardWidgetsConfigByUser: isMultiBoard
              ? {
                  ...acc.multiBoardWidgetsConfigByUser,
                  [userId]: multiBoardWidgetsConfig,
                }
              : acc.multiBoardWidgetsConfigByUser,
          };
        } catch (err) {
          console.warn(err);
          return acc;
        }
      },
      {
        usersCount: 0,
        userWithNoBoard: 0,
        usersWithBoard: 0,
        usersWithMultiBoard: 0,
        usersWithWatchlists: 0,
        usersWithWatchlistOnBoard: 0,
        emptyWlCount: 0,
        isTradingLocked: 0,
        closeConfirmation: 0,
        colorizedQuotes: 0,
        quickTradeEnabled: 0,
        boardsCount: 0,
        wlCount: 0,
        wlCountFromBoard: 0,
        instrumentsCount: 0,
        widgetsConfig: [],
        singleBoardWidgetsConfig: [],
        multiBoardWidgetsConfig: [],
        wlCountFromBoardByUser: [],
        instrumentsCountByUser: [],
        widgetsCountsByBoards: [],
        multiBoardWidgetsConfigByUser: {},
      }
    );

    const {
      instrumentsCount,
      wlCountFromBoard,
      emptyWlCount,
      boardsCount,
      usersWithBoard,
      wlCount,
      usersWithWatchlistOnBoard,
      widgetsConfig,
      singleBoardWidgetsConfig,
      multiBoardWidgetsConfig,
      wlCountFromBoardByUser,
      instrumentsCountByUser,
      widgetsCountsByBoards,
      multiBoardWidgetsConfigByUser,
      ...rest
    } = result;

    let maxChartsPerBoard = 0;
    let maxMarketDepthPerBoard = 0;

    const chartAndMarketDepthCount = widgetsCountsByBoards.reduce(
      (acc, boards) => {
        let chartCount = 0;
        let marketDepthCount = 0;

        boards.forEach((count) => {
          if (count[MARKET_DEPTH_NAME]) {
            marketDepthCount = marketDepthCount + count[MARKET_DEPTH_NAME];
            maxMarketDepthPerBoard = Math.max(
              maxMarketDepthPerBoard,
              count[MARKET_DEPTH_NAME]
            );
          }
          if (count[CHART_NAME]) {
            chartCount = chartCount + count[CHART_NAME] || 0;
            maxChartsPerBoard = Math.max(maxChartsPerBoard, count[CHART_NAME]);
          }
        });
        return {
          chartCount: acc.chartCount + chartCount,
          marketDepthCount: acc.marketDepthCount + marketDepthCount,
        };
      },
      { chartCount: 0, marketDepthCount: 0 }
    );

    const normalizedResult = {
      ...rest,
      instrumentsCountPerWatchlist: round(
        instrumentsCount / (wlCountFromBoard - emptyWlCount)
      ),
      boardsPerUser: round(boardsCount / usersWithBoard),
      wlPerBoard: round(wlCount / boardsCount),
      wlPerUser: round(wlCount / usersWithWatchlistOnBoard),
      wlMedianCountFromBoardByUser: getMedian(wlCountFromBoardByUser),
      wlCountFromBoardByUser: round(
        wlCountFromBoardByUser.reduce((acc, c) => acc + c, 0) /
          wlCountFromBoardByUser.length
      ),
      instrumentsMedianCountByUser: getMedian(instrumentsCountByUser),
      instrumentsCountByUser: round(
        instrumentsCountByUser.reduce((acc, c) => acc + c, 0) /
          instrumentsCountByUser.length
      ),
      chartsCountByBoards: round(
        chartAndMarketDepthCount.chartCount / widgetsCountsByBoards.length
      ),
      marketDepthCountByBoards: round(
        chartAndMarketDepthCount.marketDepthCount / widgetsCountsByBoards.length
      ),
      maxChartsPerBoard,
      maxMarketDepthPerBoard,
      widgetsConfig: normalizeWlConfig(widgetsConfig),
      singleBoardWidgetsConfig: normalizeWlConfig(singleBoardWidgetsConfig),
      multiBoardWidgetsConfig: normalizeWlConfig(multiBoardWidgetsConfig),
      multiBoardWidgetsConfigByUser,
    };

    renderResult(normalizedResult);
  } catch (err) {
    console.warn(err);
    throw err;
  }
}
