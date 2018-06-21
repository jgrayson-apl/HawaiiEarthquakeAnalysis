/*
  Copyright 2017 Esri

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.​
*/

define([
  "calcite",
  "dojo/_base/declare",
  "ApplicationBase/ApplicationBase",
  "dojo/i18n!./nls/resources",
  "ApplicationBase/support/itemUtils",
  "ApplicationBase/support/domHelper",
  "dojo/_base/Color",
  "dojo/colors",
  "dojo/date/locale",
  "dojo/on",
  "dojo/query",
  "dojo/dom",
  "dojo/dom-class",
  "dojo/dom-construct",
  "esri/identity/IdentityManager",
  "esri/core/Evented",
  "esri/core/watchUtils",
  "esri/core/promiseUtils",
  "esri/portal/Portal",
  "esri/layers/Layer",
  "esri/layers/FeatureLayer",
  "esri/tasks/support/StatisticDefinition",
  "esri/geometry/Extent",
  "esri/widgets/Feature",
  "esri/widgets/Home",
  "esri/widgets/Search",
  "esri/widgets/LayerList",
  "esri/widgets/Legend",
  "esri/widgets/Print",
  "esri/widgets/ScaleBar",
  "esri/widgets/Compass",
  "esri/widgets/BasemapGallery",
  "esri/widgets/Expand"
], function (calcite, declare, ApplicationBase, i18n, itemUtils, domHelper,
             Color, colors, locale, on, query, dom, domClass, domConstruct,
             IdentityManager, Evented, watchUtils, promiseUtils, Portal, Layer, FeatureLayer, StatisticDefinition,
             Extent, Feature, Home, Search, LayerList, Legend, Print, ScaleBar, Compass, BasemapGallery, Expand) {

  return declare([Evented], {

    /**
     *
     */
    constructor: function () {
      this.CSS = {
        loading: "configurable-application--loading",
        NOTIFICATION_TYPE: {
          MESSAGE: "alert alert-blue animate-in-up is-active inline-block",
          SUCCESS: "alert alert-green animate-in-up is-active inline-block",
          WARNING: "alert alert-yellow animate-in-up is-active inline-block",
          ERROR: "alert alert-red animate-in-up is-active inline-block"
        },
      };
      this.base = null;
      calcite.init();
    },

    /**
     *
     * @param base
     */
    init: function (base) {
      if(!base) {
        console.error("ApplicationBase is not defined");
        return;
      }
      domHelper.setPageLocale(base.locale);
      domHelper.setPageDirection(base.direction);

      this.base = base;
      const config = base.config;
      const results = base.results;
      const find = config.find;
      const marker = config.marker;

      const allMapAndSceneItems = results.webMapItems.concat(results.webSceneItems);
      const validMapItems = allMapAndSceneItems.map(function (response) {
        return response.value;
      });

      const firstItem = validMapItems[0];
      if(!firstItem) {
        console.error("Could not load an item to display");
        return;
      }
      config.title = (config.title || itemUtils.getItemTitle(firstItem));
      domHelper.setPageTitle(config.title);

      const viewProperties = itemUtils.getConfigViewProperties(config);
      viewProperties.container = "view-container";

      const portalItem = this.base.results.applicationItem.value;
      const appProxies = (portalItem && portalItem.appProxies) ? portalItem.appProxies : null;

      itemUtils.createMapFromItem({ item: firstItem, appProxies: appProxies }).then((map) => {
        viewProperties.map = map;
        itemUtils.createView(viewProperties).then((view) => {
          itemUtils.findQuery(find, view).then(() => {
            itemUtils.goToMarker(marker, view).then(() => {
              domClass.remove(document.body, this.CSS.loading);
              this.viewReady(config, firstItem, view);
            });
          });
        });
      });
    },

    /**
     *
     * @param config
     * @param item
     * @param view
     */
    viewReady: function (config, item, view) {

      // TITLE //
      dom.byId("app-title-node").innerHTML = config.title;

      // MAP DETAILS //
      this.displayMapDetails(item);

      // LOADING //
      const updating_node = domConstruct.create("div", { className: "view-loading-node loader" });
      domConstruct.create("div", { className: "loader-bars" }, updating_node);
      domConstruct.create("div", { className: "loader-text font-size--3 text-white", innerHTML: "Updating..." }, updating_node);
      view.ui.add(updating_node, "bottom-right");
      watchUtils.init(view, "updating", (updating) => {
        domClass.toggle(updating_node, "is-active", updating);
      });

      // PANEL TOGGLE //
      if(query(".pane-toggle-target").length > 0) {
        const panelToggleBtn = domConstruct.create("div", { className: "panel-toggle icon-ui-left-triangle-arrow icon-ui-flush font-size-1", title: "Toggle Left Panel" }, view.root);
        on(panelToggleBtn, "click", () => {
          domClass.toggle(panelToggleBtn, "icon-ui-left-triangle-arrow icon-ui-right-triangle-arrow");
          query(".pane-toggle-target").toggleClass("hide");
          query(".pane-toggle-source").toggleClass("column-18 column-24");
        });
      }

      // USER SIGN IN //
      this.initializeUserSignIn(view).always(() => {

        // POPUP DOCKING OPTIONS //
        view.popup.dockEnabled = true;
        view.popup.dockOptions = {
          buttonEnabled: false,
          breakpoint: false,
          position: "top-center"
        };

        // SEARCH //
        const search = new Search({ view: view, searchTerm: this.base.config.search || "" });
        view.ui.add(search, { position: "top-left", index: 0 });

        // HOME //
        // const homeWidget = new Home({ view: view });
        // view.ui.add(homeWidget, { position: "top-left", index: 1 });

        // BASEMAPS //
        const basemapGalleryExpand = new Expand({
          view: view,
          content: new BasemapGallery({ view: view }),
          expandIconClass: "esri-icon-basemap",
          expandTooltip: "Basemap"
        });
        view.ui.add(basemapGalleryExpand, { position: "top-left", index: 4 });

        // MAP VIEW ONLY //
        if(view.type === "2d") {
          // SNAP TO ZOOM //
          view.constraints.snapToZoom = false;

          // COMPASS //
          const compass = new Compass({ view: view });
          view.ui.add(compass, { position: "top-left", index: 5 });

          // PRINT //
          const print = new Print({
            view: view,
            printServiceUrl: (config.helperServices.printTask.url || this.base.portal.helperServices.printTask.url),
            templateOptions: { title: config.title, author: this.base.portal.user ? this.base.portal.user.fullName : "" }
          }, "print-node");
          this.updatePrintOptions = (title, author, copyright) => {
            print.templateOptions.title = title;
            print.templateOptions.author = author;
            print.templateOptions.copyright = copyright;
          };
          this.on("portal-user-change", () => {
            this.updatePrintOptions(config.title, this.base.portal.user ? this.base.portal.user.fullName : "");
          });
        } else {
          domClass.add("print-action-node", "hide");
        }

        // PLACES //
        this.initializePlaces(view);

        //
        // LAYER LIST //
        //
        // CREATE OPACITY NODE //
        const createOpacityNode = (item, parent_node) => {
          const opacity_node = domConstruct.create("div", { className: "opacity-node esri-widget", title: "Layer Opacity" }, parent_node);
          // domConstruct.create("span", { className: "font-size--3", innerHTML: "Opacity:" }, opacity_node);
          const opacity_input = domConstruct.create("input", { className: "opacity-input", type: "range", min: 0, max: 1.0, value: item.layer.opacity, step: 0.01 }, opacity_node);
          on(opacity_input, "input", () => {
            item.layer.opacity = opacity_input.valueAsNumber;
          });
          item.layer.watch("opacity", (opacity) => {
            opacity_input.valueAsNumber = opacity;
          });
          opacity_input.valueAsNumber = item.layer.opacity;
          return opacity_node;
        };
        // CREATE TOOLS NODE //
        const createToolsNode = (item, parent_node) => {
          // TOOLS NODE //
          const tools_node = domConstruct.create("div", { className: "opacity-node esri-widget" }, parent_node);

          // REORDER //
          const reorder_node = domConstruct.create("div", { className: "inline-block" }, tools_node);
          const reorder_up_node = domConstruct.create("button", { className: "btn-link icon-ui-up", title: "Move layer up..." }, reorder_node);
          const reorder_down_node = domConstruct.create("button", { className: "btn-link icon-ui-down", title: "Move layer down..." }, reorder_node);
          on(reorder_up_node, "click", () => {
            view.map.reorder(item.layer, view.map.layers.indexOf(item.layer) + 1);
          });
          on(reorder_down_node, "click", () => {
            view.map.reorder(item.layer, view.map.layers.indexOf(item.layer) - 1);
          });

          // REMOVE LAYER //
          const remove_layer_node = domConstruct.create("button", { className: "btn-link icon-ui-close right", title: "Remove layer from map..." }, tools_node);
          on.once(remove_layer_node, "click", () => {
            view.map.remove(item.layer);
            this.emit("layer-removed", item.layer);
          });

          // ZOOM TO //
          const zoom_to_node = domConstruct.create("button", { className: "btn-link icon-ui-zoom-in-magnifying-glass right", title: "Zoom to Layer" }, tools_node);
          on(zoom_to_node, "click", () => {
            view.goTo(item.layer.fullExtent);
          });

          // LAYER DETAILS //
          const itemDetailsPageUrl = `${this.base.portal.url}/home/item.html?id=${item.layer.portalItem.id}`;
          domConstruct.create("a", { className: "btn-link icon-ui-description icon-ui-blue right", title: "View details...", target: "_blank", href: itemDetailsPageUrl }, tools_node);

          return tools_node;
        };
        // LAYER LIST //
        const layerList = new LayerList({
          view: view,
          listItemCreatedFunction: (evt) => {
            let item = evt.item;
            if(item.layer && item.layer.portalItem) {

              // CREATE ITEM PANEL //
              const panel_node = domConstruct.create("div", { className: "esri-widget" });

              // LAYER TOOLS //
              createToolsNode(item, panel_node);

              // OPACITY //
              createOpacityNode(item, panel_node);

              // if(item.layer.type === "imagery") {
              //   this.configureImageryLayer(view, item.layer, panel_node);
              // }

              // LEGEND //
              if(item.layer.legendEnabled) {
                const legend = new Legend({ container: panel_node, view: view, layerInfos: [{ layer: item.layer }] })
              }

              // SET ITEM PANEL //
              item.panel = {
                title: "Settings",
                className: "esri-icon-settings",
                content: panel_node
              };
            }
          }
        });
        view.ui.add(layerList, { position: "top-right", index: 0 });


        this.initializeUndergroundDisplay(view);

        this.initializeHawaiiEarthquakeAnalysis(view);

      });

    },

    /**
     * DISPLAY MAP DETAILS
     *
     * @param portalItem
     */
    displayMapDetails: function (portalItem) {

      const itemLastModifiedDate = (new Date(portalItem.modified)).toLocaleString();

      dom.byId("current-map-card-thumb").src = portalItem.thumbnailUrl;
      dom.byId("current-map-card-thumb").alt = portalItem.title;
      dom.byId("current-map-card-caption").innerHTML = `A map by ${portalItem.owner}`;
      dom.byId("current-map-card-caption").title = "Last modified on " + itemLastModifiedDate;
      dom.byId("current-map-card-title").innerHTML = portalItem.title;
      dom.byId("current-map-card-title").href = `https://www.arcgis.com/home/item.html?id=${portalItem.id}`;
      dom.byId("current-map-card-description").innerHTML = portalItem.description;

    },

    /**
     *
     * @returns {*}
     */
    initializeUserSignIn: function (view) {

      const checkSignInStatus = () => {
        return IdentityManager.checkSignInStatus(this.base.portal.url).then(userSignIn);
      };
      IdentityManager.on("credential-create", checkSignInStatus);
      IdentityManager.on("credential-destroy", checkSignInStatus);

      // SIGN IN NODE //
      const signInNode = dom.byId("sign-in-node");
      const userNode = dom.byId("user-node");

      // UPDATE UI //
      const updateSignInUI = () => {
        if(this.base.portal.user) {
          dom.byId("user-firstname-node").innerHTML = this.base.portal.user.fullName.split(" ")[0];
          dom.byId("user-fullname-node").innerHTML = this.base.portal.user.fullName;
          dom.byId("username-node").innerHTML = this.base.portal.user.username;
          dom.byId("user-thumb-node").src = this.base.portal.user.thumbnailUrl;
          domClass.add(signInNode, "hide");
          domClass.remove(userNode, "hide");
        } else {
          domClass.remove(signInNode, "hide");
          domClass.add(userNode, "hide");
        }
        return promiseUtils.resolve();
      };

      // SIGN IN //
      const userSignIn = () => {
        this.base.portal = new Portal({ url: this.base.config.portalUrl, authMode: "immediate" });
        return this.base.portal.load().then(() => {
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).otherwise(console.warn);
      };

      // SIGN OUT //
      const userSignOut = () => {
        IdentityManager.destroyCredentials();
        this.base.portal = new Portal({});
        this.base.portal.load().then(() => {
          this.base.portal.user = null;
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).otherwise(console.warn);

      };

      // USER SIGN IN //
      on(signInNode, "click", userSignIn);

      // SIGN OUT NODE //
      const signOutNode = dom.byId("sign-out-node");
      if(signOutNode) {
        on(signOutNode, "click", userSignOut);
      }

      return checkSignInStatus();
    },

    /**
     *
     * @param view
     */
    initializePlaces: function (view) {

      // WEB SCENE //
      if(view.map.presentation && view.map.presentation.slides && (view.map.presentation.slides.length > 0)) {
        // PLACES PANEL //
        const placesPanel = domConstruct.create("div", { className: "places-panel panel panel-no-padding esri-widget" });
        const placesExpand = new Expand({
          view: view,
          content: placesPanel,
          expandIconClass: "esri-icon-applications",
          expandTooltip: "Places"
        }, domConstruct.create("div"));
        view.ui.add(placesExpand, "bottom-left");

        // SLIDES //
        const slides = view.map.presentation.slides;
        slides.forEach((slide) => {

          const slideNode = domConstruct.create("div", { className: "places-node esri-interactive" }, placesPanel);
          domConstruct.create("img", { className: "", src: slide.thumbnail.url }, slideNode);
          domConstruct.create("span", { className: "places-label", innerHTML: slide.title.text }, slideNode);

          on(slideNode, "click", () => {
            slide.applyTo(view, {
              animate: true,
              speedFactor: 0.33,
              easing: "in-out-cubic"   // linear, in-cubic, out-cubic, in-out-cubic, in-expo, out-expo, in-out-expo
            }).then(() => {
              placesExpand.collapse();
            });
          });
        });

        view.on("layerview-create", (evt) => {
          if(evt.layer.visible) {
            slides.forEach((slide) => {
              slide.visibleLayers.add({ id: evt.layer.id });
            });
          }
        });
      } else {
        // WEB MAP //
        if(view.map.bookmarks && view.map.bookmarks.length > 0) {

          // PLACES DROPDOWN //
          const placesDropdown = domConstruct.create("div", { className: "dropdown js-dropdown esri-widget" });
          view.ui.add(placesDropdown, { position: "top-left", index: 1 });
          const placesBtn = domConstruct.create("button", {
            className: "btn btn-transparent dropdown-btn js-dropdown-toggle",
            "tabindex": "0", "aria-haspopup": "true", "aria-expanded": "false",
            innerHTML: "Places"
          }, placesDropdown);
          domConstruct.create("span", { className: "icon-ui-down" }, placesBtn);
          // MENU //
          const placesMenu = domConstruct.create("nav", { className: "dropdown-menu modifier-class" }, placesDropdown);

          // BOOKMARKS //
          view.map.bookmarks.forEach((bookmark) => {
            // MENU ITEM //
            const bookmarkNode = domConstruct.create("div", {
              className: "dropdown-link",
              role: "menu-item",
              innerHTML: bookmark.name
            }, placesMenu);
            on(bookmarkNode, "click", () => {
              view.goTo({ target: Extent.fromJSON(bookmark.extent) });
            });
          });

          // INITIALIZE CALCITE DROPDOWN //
          calcite.dropdown();
        }
      }

    },

    /**
     *
     * @param layer
     * @param error
     */
    addLayerNotification: function (layer, error) {
      const notificationsNode = dom.byId("notifications-node");

      const alertNode = domConstruct.create("div", {
        className: error ? this.CSS.NOTIFICATION_TYPE.ERROR : this.CSS.NOTIFICATION_TYPE.SUCCESS
      }, notificationsNode);

      const alertCloseNode = domConstruct.create("div", { className: "inline-block esri-interactive icon-ui-close margin-left-1 right" }, alertNode);
      on.once(alertCloseNode, "click", () => {
        domConstruct.destroy(alertNode);
      });

      domConstruct.create("div", { innerHTML: error ? error.message : `Layer '${layer.title}' added to map...` }, alertNode);

      if(error) {
        if(layer.portalItem) {
          const itemDetailsPageUrl = `${this.base.portal.url}/home/item.html?id=${layer.portalItem.id}`;
          domConstruct.create("a", { innerHTML: "view item details", target: "_blank", href: itemDetailsPageUrl }, alertNode);
        }
      } else {
        setTimeout(() => {
          domClass.toggle(alertNode, "animate-in-up animate-out-up");
          setTimeout(() => {
            domConstruct.destroy(alertNode);
          }, 500)
        }, 4000);
      }
    },

    /**
     *
     * @param view
     */
    initializeHawaiiEarthquakeAnalysis_from_service_not_used: function (view) {

      const lava_layer = new FeatureLayer({
        url: "https://services.arcgis.com/8df8p0NlLFEShl0r/ArcGIS/rest/services/Hawaii_Earthquake_Analysis_WFL1/FeatureServer",
        layerId: 0,
        title: "Lava Flow"
      });
      view.map.add(lava_layer);
      lava_layer.load().then(() => {
        this.initializeLavaFlow(view, lava_layer);
      });

      const earthquakes_layer = new FeatureLayer({
        url: "https://services.arcgis.com/8df8p0NlLFEShl0r/ArcGIS/rest/services/Hawaii_Earthquake_Analysis_WFL1/FeatureServer",
        layerId: 1,
        title: "Earthquakes",
        outFields: ["*"],
        popupTemplate: {
          title: "M:{mag} D:{depth} - {place}",
          content: "{*}"
        },
        definitionExpression: "depth_neg < 0.0",
        elevationInfo: {
          mode: "relative-to-ground",
          featureExpressionInfo: {
            expression: "$feature.depth_neg"
          },
          unit: "kilometers"
        }
      });
      view.map.add(earthquakes_layer);

    },

    /**
     *
     * @param view
     */
    initializeHawaiiEarthquakeAnalysis: function (view) {

      Layer.fromPortalItem({ portalItem: { id: "75d690620dfd46b893e65b4548409d52" } }).then((hawaii_earthquake_analysis_layer) => {
        hawaii_earthquake_analysis_layer.load().then(() => {
          view.map.add(hawaii_earthquake_analysis_layer);

          const layers_to_hide = ["Major Roads", "Zoning Parcels"];
          promiseUtils.eachAlways(hawaii_earthquake_analysis_layer.layers.map(layer => {
            return layer.load().then(() => {
              layer.visible = !layers_to_hide.includes(layer.title);
            });
          })).then(() => {

            // LAVA //
            const lava_layer = hawaii_earthquake_analysis_layer.layers.find(layer => {
              return (layer.title === "Lava Flow Over Time");
            });

            // EARTHQUAKES //
            const earthquakes_layer = hawaii_earthquake_analysis_layer.layers.find(layer => {
              return (layer.title === "Earthquakes 06182018");
            });
            earthquakes_layer.definitionExpression = "depth_neg < 0.0";
            earthquakes_layer.elevationInfo = {
              mode: "absolute-height",
              featureExpressionInfo: {
                expression: "$feature.depth_neg",
              },
              unit: "kilometers"
            };

            // INITIALIZE EARTHQUAKE RENDERER //
            this.createEarthquakeRenderer = this.initializeEarthquakeRenderer(earthquakes_layer.renderer, "Date_Time");

            // TIME CHANGE //
            this.on("time-change", evt => {
              lava_layer.renderer = this.createLavaRenderer(evt.dateTimeValue);
              earthquakes_layer.renderer = this.createEarthquakeRenderer(evt.dateTimeValue)
            });

            // GET COMBINED TIME EXTENT //
            this.getLayerTimeExtent(lava_layer, "FieldTime").then((lava_time_stats) => {
              this.getLayerTimeExtent(earthquakes_layer, "Date_Time").then((quakes_time_stats) => {
                const time_extent = {
                  min: new Date(Math.min(lava_time_stats.min, quakes_time_stats.min)),
                  max: new Date(Math.max(lava_time_stats.max, quakes_time_stats.max))
                };
                // INITIALIZE TIME FILTER //
                this.initializeTimeFilter(view, time_extent);
              });
            });

          });
        });
      });

    },

    /**
     *
     * @param layer
     * @param time_field
     * @returns {Promise}
     */
    getLayerTimeExtent: function (layer, time_field) {

      const time_min_stat = new StatisticDefinition({
        statisticType: "min",
        onStatisticField: time_field,
        outStatisticFieldName: "time_min"
      });
      const time_max_stat = new StatisticDefinition({
        statisticType: "max",
        onStatisticField: time_field,
        outStatisticFieldName: "time_max"
      });

      const time_query = layer.createQuery();
      time_query.outStatistics = [time_min_stat, time_max_stat];
      return layer.queryFeatures(time_query).then(stats_features => {
        const time_stats = stats_features.features[0].attributes;
        return {
          min: time_stats.time_min,
          max: time_stats.time_max
        };
      });

    },

    /**
     *
     * @param view
     * @param timeExtent
     */
    initializeTimeFilter: function (view, timeExtent) {

      const current_time_info = {
        min: timeExtent.min,
        max: timeExtent.max
      };

      const format_date = (date_time) => {
        return locale.format(date_time, { datePattern: "MMMM d", timePattern: "h:mm a" });
      };

      dom.byId("current-time-node").innerHTML = format_date(current_time_info.min);
      dom.byId("time-range-node").innerHTML = `${format_date(current_time_info.min)}&nbsp;&nbsp;&nbsp;to&nbsp;&nbsp;&nbsp;${format_date(current_time_info.max)}`;

      const time_input = dom.byId("time-input");
      time_input.min = current_time_info.min.valueOf();
      time_input.max = current_time_info.max.valueOf();
      time_input.valueAsNumber = time_input.min;
      domClass.remove(time_input, "btn-disabled");

      on(time_input, "input", () => {
        update_time_filter();
      });
      on(time_input, "change", () => {
        update_time_filter();
      });

      const set_time = (date_time) => {
        time_input.valueAsNumber = date_time;
        update_time_filter();
      };

      const update_time_filter = () => {
        dom.byId("current-time-node").innerHTML = format_date(new Date(time_input.valueAsNumber));
        this.emit("time-change", { dateTimeValue: time_input.valueAsNumber })
      };

      update_time_filter();


      //
      // ANIMATION STUFF //
      //

      let animation;

      function startAnimation() {
        stopAnimation();
        domClass.add(time_input, "btn-disabled");
        animation = animate(parseFloat(time_input.value));
      }

      function stopAnimation() {
        if(!animation) {
          return;
        }
        animation.remove();
        animation = null;
        domClass.remove(time_input, "btn-disabled");
      }

      function animate(startValue) {
        let animating = true;
        let value = startValue;

        const one_hour = (1000 * 60 * 60);

        const frame = function () {
          if(!animating) {
            return;
          }

          value += (one_hour * 3);
          if(value > current_time_info.max.valueOf()) {
            setTimeout(() => {
              value = current_time_info.min.valueOf()
            }, 1500);
          }

          set_time(value);

          setTimeout(() => {
            requestAnimationFrame(frame);
          }, 1000 / 30);
        };

        frame();

        return {
          remove: function () {
            animating = false;
          }
        };
      }

      const play_pause_btn = dom.byId("play-pause-btn");
      on(play_pause_btn, "click", () => {
        domClass.toggle(play_pause_btn, "icon-ui-play icon-ui-pause icon-ui-green icon-ui-red");
        if(domClass.contains(play_pause_btn, "icon-ui-play")) {
          stopAnimation();
        } else {
          startAnimation();
        }
      })

    },

    /**
     *
     * @param date_time_value
     * @returns {*}
     */
    createLavaRenderer: function (date_time_value) {

      const one_hour = (1000 * 60 * 60);

      return {
        type: "simple",
        symbol: {
          type: "simple-fill",
          style: "solid",
          color: Color.named.black,
          outline: {
            type: "simple-line",
            style: "solid",
            color: Color.named.transparent,
            width: "3px",
            cap: "round",
            join: "round"
          }
        },
        visualVariables: [
          {
            "type": "color",
            "field": "FieldTime",
            "valueExpression": null,
            "stops": [
              { "value": date_time_value - (one_hour * 24), "color": "#444" },
              { "value": date_time_value, "color": Color.named.red }
            ]
          },
          {
            type: "opacity",
            field: "FieldTime",
            stops: [
              /*{
                label: "previous",
                opacity: 0.0,
                value: 1
              },*/
              /*{
                label: "-24 hours",
                opacity: 0.1,
                value: date_time_value - (one_hour * 24)
              },*/
              /*{
                label: "-3 hours",
                opacity: 0.5,
                value: date_time_value - (one_hour * 3)
              },*/
              {
                label: "now",
                opacity: 1.0,
                value: date_time_value // - (one_hour * 24)
              },
              {
                label: "+12 hours",
                opacity: 0.0,
                value: date_time_value + (one_hour * 12)
              }
            ],
            legendOptions: {
              showLegend: true
            }
          }
        ]
      };

    },

    /**
     *
     * @param default_renderer
     * @param time_field
     */
    initializeEarthquakeRenderer: function (default_renderer, time_field) {

      const one_hour = (1000 * 60 * 60);

      return (date_time_value) => {

        const renderer = default_renderer.clone();
        renderer.defaultSymbol = null;
        renderer.visualVariables = [
          {
            type: "opacity",
            field: time_field,
            stops: [
              {
                label: "previous",
                opacity: 0.0,
                value: 0
              },
              {
                label: "-24 hours",
                opacity: 0.0,
                value: date_time_value - (one_hour * 24)
              },
              {
                label: "-6 hours",
                opacity: 0.8,
                value: date_time_value - (one_hour * 6)
              },
              {
                label: "now",
                opacity: 1.0,
                value: date_time_value
              },
              {
                label: "+6 hours",
                opacity: 0.0,
                value: date_time_value + (one_hour * 6)
              }
            ],
            legendOptions: {
              showLegend: true
            }

          }
        ];

        return renderer;
      }

    },

    /**
     *
     * @param view
     */
    initializeUndergroundDisplay: function (view) {

      view.map.basemap.when(() => {

        // HIDE BASEMAP //
        /*const adjustDefaultBasemap = (opacity) => {
         view.map.basemap.baseLayers.concat(view.map.basemap.referenceLayers).forEach((basemapLayer) => {
         basemapLayer.opacity = opacity
         });
         };
         let isBasemapVisible = true;
         const hideBasemapBtn = dom.byId("hide-basemap-btn");
         on(hideBasemapBtn, "click", () => {
         isBasemapVisible = (!isBasemapVisible);
         adjustDefaultBasemap(isBasemapVisible ? 1.0 : 0.0);
         });*/


        // ALLOW UNDERGROUND NAVIGATION //
        view.map.ground.navigationConstraint = { type: "none" };

        // SEE THROUGH GROUND //
        const seeThroughBtn = domConstruct.create("button", {
          title: "Toggle Ground Opacity",
          className: "btn btn-clear icon-ui-experimental icon-ui-flush btn-disabled"
        });
        view.ui.add(seeThroughBtn, "top-right");
        on(seeThroughBtn, "click", () => {
          domClass.toggle(seeThroughBtn, "btn-clear icon-ui-check-mark");
          if(domClass.contains(seeThroughBtn, "icon-ui-check-mark")) {
            view.map.ground.opacity = 0.5;
            /* view.basemapTerrain.wireframe = {
               mode: "shader",
               wireOpacity: 1.0,
               surfaceOpacity: 0.0,
               width: 1,
               subdivision: "constant",
               subdivisionReduceLevels: 2
             };
             view.basemapTerrain.frontMostTransparent = false;*/
          } else {
            // view.basemapTerrain.wireframe = false;
            // view.basemapTerrain.frontMostTransparent = false;
            view.map.ground.opacity = 1.0;
          }
        });
        domClass.remove(seeThroughBtn, "btn-disabled");

        // CLIP EXTENT //
        /*const clipExtentBtn = dom.byId("clip-extent-btn");
        on(clipExtentBtn, "click", () => {
          domClass.toggle(clipExtentBtn, "btn-clear icon-ui-check-mark");
          view.clippingArea = domClass.contains(clipExtentBtn, "icon-ui-check-mark") ? view.extent.expand(0.8) : null;
        });
        domClass.remove(clipExtentBtn, "btn-disabled");*/

      });

    },

  });
});