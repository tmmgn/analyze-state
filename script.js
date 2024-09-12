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

function isParent(node) {
  return node.direction != null;
}

function getLeaves(tree) {
  if (tree == null) {
    return [];
  } else if (isParent(tree)) {
    return getLeaves(tree.first).concat(getLeaves(tree.second));
  } else {
    return [tree];
  }
}

function analyzeFile(data) {
  try {
    const parsedFile = JSON.parse(data);
    const result = parsedFile.reduce(
      (acc, setting) => {
        try {
          //   const userId = setting.user_id;
          const parsedState = JSON.parse(setting.state);
          const accountsSettings = parsedState.account
            ? Object.entries(parsedState.account)
            : [];
          //   const membersSettings = parsedState.account
          //     ? Object.values(parsedState.member)
          //     : [];

          accountsSettings.forEach(([accountId, settings]) => {
            const { trade = {}, v2, watchlists, boards } = settings;
            const isTradingLocked = trade.isTradingLocked;
            const closeConfirmation = trade.closeConfirmation;
            const quickTradeEnabled = trade.quick?.enabled;
            const boardsCount = v2?.tileBoard?.boards?.length || 0;
            const wlCount = watchlists?.length || 0;
            let emptyWlCount = 0;
            let wlCountFromBoard = 0;
            let wlIds = [];
            const panels = v2?.tileBoard?.boards || [];
            let widgetsConfig = [];
            let singleBoardWidgetsConfig = [];
            let multiBoardWidgetsConfig = [];
            const isMultiBoard = panels?.length > 1;
            let widgetsCountForEachBoard = [];
            const structure = settings?.structure;
            const widgets = settings?.widgets;
            if (panels?.length) {
              const configs = panels.map((boardId) => {
                const mosaicStructure = structure?.[boardId];
                const widgetIds = getLeaves(mosaicStructure)?.filter(
                  (leave) => Object.keys(leave).length
                );
                const boardWatchlists = boards[boardId]?.watchlists;
                if (boardWatchlists?.length) {
                  wlCountFromBoard = wlCountFromBoard + boardWatchlists.length; // Count watchlists that present in board
                  wlIds = [...wlIds, ...boardWatchlists];
                }

                let widgetsCount = {};
                const widgetsOnBoard = widgetIds
                  .map((w) => {
                    const name = widgets[w].component;
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
            (acc.accountsCount = acc.accountsCount + 1),
              (acc.accountWithNoBoard = !boardsCount
                ? acc.accountWithNoBoard + 1
                : acc.accountWithNoBoard);
            acc.accountsWithBoard = boardsCount
              ? acc.accountsWithBoard + 1
              : acc.accountsWithBoard;
            acc.accountsWithMultiBoard = isMultiBoard
              ? acc.accountsWithMultiBoard + 1
              : acc.accountsWithMultiBoard;
            acc.accountsWithWatchlists = wlCount
              ? acc.accountsWithWatchlists + 1
              : acc.accountsWithWatchlists;
            acc.accountsWithWatchlistOnBoard = wlCountFromBoard
              ? acc.accountsWithWatchlistOnBoard + 1
              : acc.accountsWithWatchlistOnBoard;
            acc.emptyWlCount = emptyWlCount
              ? acc.emptyWlCount + 1
              : acc.emptyWlCount;
            acc.isTradingLocked = isTradingLocked
              ? acc.isTradingLocked + 1
              : acc.isTradingLocked;
            acc.closeConfirmation = closeConfirmation
              ? acc.closeConfirmation + 1
              : acc.closeConfirmation;
            acc.quickTradeEnabled = quickTradeEnabled
              ? acc.quickTradeEnabled + 1
              : acc.quickTradeEnabled;
            acc.boardsCount = acc.boardsCount + boardsCount;
            acc.wlCount = acc.wlCount + wlCount;
            acc.wlCountFromBoard = acc.wlCountFromBoard + wlCountFromBoard;
            acc.wlCountFromBoardByAccount = wlCountFromBoard // Adds value only if we have watchlists on boards for median value
              ? [...acc.wlCountFromBoardByAccount, wlCountFromBoard]
              : acc.wlCountFromBoardByAccount;
            acc.instrumentsCountByAccount = instrumentsCount // Adds value only if we have instruments for median value
              ? [...acc.instrumentsCountByAccount, instrumentsCount]
              : acc.instrumentsCountByAccount;
            acc.instrumentsCount =
              acc.instrumentsCount + (instrumentsCount || 0);
            acc.widgetsConfig = _.sortBy([
              ...acc.widgetsConfig,
              ...widgetsConfig,
            ]);
            acc.singleBoardWidgetsConfig = _.sortBy([
              ...acc.singleBoardWidgetsConfig,
              ...singleBoardWidgetsConfig,
            ]);
            acc.multiBoardWidgetsConfig = _.sortBy([
              ...acc.multiBoardWidgetsConfig,
              ...multiBoardWidgetsConfig,
            ]);
            acc.widgetsCountsByBoards = [
              ...acc.widgetsCountsByBoards,
              normalizedWidgetsCountForEachBoard,
            ].filter((c) => c.length);
            acc.multiBoardWidgetsConfigByAccount = isMultiBoard
              ? {
                  ...acc.multiBoardWidgetsConfigByAccount,
                  [accountId]: multiBoardWidgetsConfig,
                }
              : acc.multiBoardWidgetsConfigByAccount;
          });
          acc.usersCount = acc.usersCount + 1;
          return acc;
        } catch (err) {
          console.warn(err);
          return acc;
        }
      },
      {
        usersCount: 0,
        accountsCount: 0,
        accountWithNoBoard: 0,
        accountsWithBoard: 0,
        accountsWithMultiBoard: 0,
        accountsWithWatchlists: 0,
        accountsWithWatchlistOnBoard: 0,
        emptyWlCount: 0,
        isTradingLocked: 0,
        closeConfirmation: 0,
        quickTradeEnabled: 0,
        boardsCount: 0,
        wlCount: 0,
        wlCountFromBoard: 0,
        instrumentsCount: 0,
        widgetsConfig: [],
        singleBoardWidgetsConfig: [],
        multiBoardWidgetsConfig: [],
        wlCountFromBoardByAccount: [],
        instrumentsCountByAccount: [],
        widgetsCountsByBoards: [],
        multiBoardWidgetsConfigByAccount: {},
      }
    );

    const {
      instrumentsCount,
      wlCountFromBoard,
      emptyWlCount,
      boardsCount,
      accountsWithBoard,
      wlCount,
      accountsWithWatchlistOnBoard,
      widgetsConfig,
      singleBoardWidgetsConfig,
      multiBoardWidgetsConfig,
      wlCountFromBoardByAccount,
      instrumentsCountByAccount,
      widgetsCountsByBoards,
      multiBoardWidgetsConfigByAccount,
      ...rest
    } = result;

    let maxChartsPerBoard = 0;
    let maxMarketDepthPerBoard = 0;
    console.log({ result });

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
      boardsPerAccount: round(boardsCount / accountsWithBoard),
      wlPerBoard: round(wlCount / boardsCount),
      wlPerAccount: round(wlCount / accountsWithWatchlistOnBoard),
      wlMedianCountFromBoardByAccount: getMedian(wlCountFromBoardByAccount),
      wlCountFromBoardByAccount: round(
        wlCountFromBoardByAccount.reduce((acc, c) => acc + c, 0) /
          wlCountFromBoardByAccount.length
      ),
      instrumentsMedianCountByAccount: getMedian(instrumentsCountByAccount),
      instrumentsCountByAccount: round(
        instrumentsCountByAccount.reduce((acc, c) => acc + c, 0) /
          instrumentsCountByAccount.length
      ),
      chartsCountByBoards: round(
        chartAndMarketDepthCount.chartCount /
          _.flatten(widgetsCountsByBoards).length
      ),
      marketDepthCountByBoards: round(
        chartAndMarketDepthCount.marketDepthCount /
          _.flatten(widgetsCountsByBoards).length
      ),
      maxChartsPerBoard,
      maxMarketDepthPerBoard,
      widgetsConfig: normalizeWlConfig(widgetsConfig),
      singleBoardWidgetsConfig: normalizeWlConfig(singleBoardWidgetsConfig),
      multiBoardWidgetsConfig: normalizeWlConfig(multiBoardWidgetsConfig),
      multiBoardWidgetsConfigByAccount,
    };

    renderResult(normalizedResult);
  } catch (err) {
    console.warn(err);
    throw err;
  }
}
