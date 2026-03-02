<script setup>
import { ref, onMounted, nextTick, computed } from "vue";

const formData = ref({
  placa: "RFQ-1I47",
  dataInicio: "",
  horaInicio: "",
  dataFim: "",
  horaFim: "",
});
const PROXY_URL = import.meta.env.VITE_PROXY_URL;
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const loading = ref(false);
const error = ref("");
const positions = ref([]);
const showMap = ref(false);
const mapContainer = ref(null);
const isHeatmapMode = ref(false);
const selectedPositionIndex = ref(null);
const filiais = ref([]);
const showFiliais = ref(true);
const currentPage = ref(1);
const itemsPerPage = 20;
const pageInput = ref(1);
let filiaisMarkers = [];
let map = null;
let markers = [];
let polyline = null;
let heatmap = null;

const paginatedPositions = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  return positions.value.slice(start, end);
});

const totalPages = computed(() => {
  return Math.ceil(positions.value.length / itemsPerPage);
});

const middlePages = computed(() => {
  const pages = [];
  const start = Math.max(2, currentPage.value - 1);
  const end = Math.min(totalPages.value - 1, currentPage.value + 1);

  for (let i = start; i <= end; i++) {
    if (i !== 1 && i !== totalPages.value) {
      pages.push(i);
    }
  }
  return pages;
});

// Carrega o Google Maps API com biblioteca de visualização
const loadGoogleMapsScript = () => {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    if (!GOOGLE_MAPS_API_KEY) {
      reject(new Error("VITE_GOOGLE_MAPS_API_KEY não configurado"));
      return;
    }
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=visualization&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

const loadFiliais = async () => {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}filiais.json`);
    filiais.value = await response.json();
  } catch (err) {
    console.error("Erro ao carregar filiais:", err);
  }
};

onMounted(() => {
  loadGoogleMapsScript().catch((err) => {
    console.error("Erro ao carregar Google Maps:", err);
  });
  loadFiliais(); // Carrega as filiais
});

const convertToUTC0 = (date, time) => {
  const dateTimeStr = `${date}T${time}:00-03:00`;
  const dateObj = new Date(dateTimeStr);
  const year = dateObj.getUTCFullYear();
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getUTCDate()).padStart(2, "0");
  const hours = String(dateObj.getUTCHours()).padStart(2, "0");
  const minutes = String(dateObj.getUTCMinutes()).padStart(2, "0");
  const seconds = String(dateObj.getUTCSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const convertFromUTC0 = (utcDateStr) => {
  const dateObj = new Date(utcDateStr + "Z");
  return dateObj.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

const parseSoapResponse = (xmlText) => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");
  const parserError = xmlDoc.querySelector("parsererror");
  if (parserError) throw new Error("Erro ao processar resposta XML");

  const id = xmlDoc.querySelector("id")?.textContent || "";
  const erro = xmlDoc.querySelector("erro")?.textContent || "";
  if (id !== "0") throw new Error(erro || "Erro desconhecido na API");

  const items = xmlDoc.querySelectorAll("item");
  const posicoes = [];

  items.forEach((item) => {
    const getField = (name) => item.querySelector(name)?.textContent || "";
    posicoes.push({
      dataHora: getField("data_hora"),
      latitude: parseFloat(getField("latitude")) || 0,
      longitude: parseFloat(getField("longitude")) || 0,
      velocidade: parseInt(getField("velocidade")) || 0,
      numeroSatelites: parseInt(getField("numero_satelites")) || 0,
      ignicao: parseInt(getField("ignicao")) || 0,
      odometro: getField("odometro"),
      placa: getField("placa"),
      numeroSerie: getField("numero_serie"),
    });
  });
  return posicoes;
};

const toggleMapMode = () => {
  isHeatmapMode.value = !isHeatmapMode.value;

  if (isHeatmapMode.value) {
    // Oculta marcadores e trajeto
    markers.forEach((marker) => marker.setMap(null));
    if (polyline) polyline.setMap(null);

    // Cria ou mostra mapa de calor
    if (!heatmap && window.google && window.google.maps.visualization) {
      // Cria array de pontos SEM peso (densidade pura)
      const heatmapData = positions.value.map((pos) => {
        return new google.maps.LatLng(pos.latitude, pos.longitude);
        // ← SEM peso! Apenas lat/lng
      });

      console.log("Criando heatmap com", heatmapData.length, "pontos");

      heatmap = new google.maps.visualization.HeatmapLayer({
        data: heatmapData,
        map: map,
        radius: 30, // Raio menor para melhor precisão
        maxIntensity: null, // Remove intensidade máxima (densidade natural)
        opacity: 0.6,
        dissipating: true,
        gradient: [
          "rgba(0, 255, 255, 0)", // Transparente
          "rgba(0, 255, 255, 0.7)", // Azul claro
          "rgba(0, 191, 255, 1)", // Azul médio
          "rgba(0, 127, 255, 1)", // Azul escuro
          "rgba(0, 63, 255, 1)", // Roxo azulado
          "rgba(127, 0, 191, 1)", // Roxo
          "rgba(191, 0, 127, 1)", // Rosa
          "rgba(255, 0, 63, 1)", // Vermelho rosado
          "rgba(255, 0, 0, 1)", // Vermelho puro
        ],
      });
    } else if (heatmap) {
      heatmap.setMap(map);
    }
  } else {
    // Oculta mapa de calor
    if (heatmap) heatmap.setMap(null);

    // Mostra marcadores e trajeto
    markers.forEach((marker) => marker.setMap(map));
    if (polyline) polyline.setMap(map);
  }
};

const initMap = async () => {
  if (!mapContainer.value || positions.value.length === 0) return;

  await loadGoogleMapsScript();

  // Limpa marcadores anteriores
  markers.forEach((marker) => marker.setMap(null));
  markers = [];
  if (polyline) polyline.setMap(null);
  if (heatmap) heatmap.setMap(null);
  heatmap = null;
  isHeatmapMode.value = false;

  console.log("Inicializando mapa com", positions.value.length, "posições");

  // Centro do mapa na primeira posição
  const firstPos = positions.value[0];
  const center = { lat: firstPos.latitude, lng: firstPos.longitude };

  // Cria o mapa
  map = new google.maps.Map(mapContainer.value, {
    zoom: 14,
    center: center,
    mapTypeId: "roadmap",
    styles: [
      {
        featureType: "poi",
        elementType: "labels",
        stylers: [{ visibility: "off" }],
      },
    ],
  });

  // Cria array de coordenadas para a polyline (trajeto)
  const path = positions.value.map((pos) => ({
    lat: pos.latitude,
    lng: pos.longitude,
  }));

  // Desenha a linha do trajeto
  polyline = new google.maps.Polyline({
    path: path,
    geodesic: true,
    strokeColor: "#4F46E5",
    strokeOpacity: 0.8,
    strokeWeight: 3,
  });
  polyline.setMap(map);

  // Adiciona marcadores
  positions.value.forEach((pos, index) => {
    const isFirst = index === 0;
    const isLast = index === positions.value.length - 1;

    let icon = {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 6,
      fillColor: isFirst ? "#10B981" : isLast ? "#EF4444" : "#4F46E5",
      fillOpacity: 1,
      strokeColor: "#FFFFFF",
      strokeWeight: 2,
    };

    if (isFirst || isLast) {
      icon.scale = 8;
    }

    const marker = new google.maps.Marker({
      position: { lat: pos.latitude, lng: pos.longitude },
      map: map,
      icon: icon,
      title: `${convertFromUTC0(pos.dataHora)} - ${pos.velocidade} km/h`,
    });

    // InfoWindow com detalhes
    const infoWindow = new google.maps.InfoWindow({
      content: `
        <div style="padding: 8px; max-width: 250px;">
          <h3 style="margin: 0 0 8px 0; font-weight: bold; color: #1f2937;">
            ${
              isFirst
                ? "🟢 Início"
                : isLast
                ? "🔴 Fim"
                : "📍 Posição " + (index + 1)
            }
          </h3>
          <p style="margin: 4px 0; font-size: 13px;"><strong>Data/Hora:</strong> ${convertFromUTC0(
            pos.dataHora
          )}</p>
          <p style="margin: 4px 0; font-size: 13px;"><strong>Velocidade:</strong> ${
            pos.velocidade
          } km/h</p>
          <p style="margin: 4px 0; font-size: 13px;"><strong>Ignição:</strong> ${
            pos.ignicao ? "Ligada" : "Desligada"
          }</p>
          <p style="margin: 4px 0; font-size: 13px;"><strong>Satélites:</strong> ${
            pos.numeroSatelites
          }</p>
          ${
            pos.odometro
              ? `<p style="margin: 4px 0; font-size: 13px;"><strong>Odômetro:</strong> ${pos.odometro} km</p>`
              : ""
          }
        </div>
      `,
    });

    marker.addListener("click", () => {
      infoWindow.open(map, marker);
    });

    markers.push(marker);
  });

  // Ajusta o zoom para mostrar todos os pontos
  const bounds = new google.maps.LatLngBounds();
  path.forEach((point) => bounds.extend(point));
  map.fitBounds(bounds);
  addFiliaisToMap();
};

const handleSubmit = async () => {
  error.value = "";
  positions.value = [];
  showMap.value = false;

  if (
    !formData.value.placa ||
    !formData.value.dataInicio ||
    !formData.value.horaInicio ||
    !formData.value.dataFim ||
    !formData.value.horaFim
  ) {
    error.value = "Todos os campos são obrigatórios";
    return;
  }
  if (!PROXY_URL) {
    error.value = "VITE_PROXY_URL não configurado";
    return;
  }

  loading.value = true;

  try {
    const dataInicioUTC = convertToUTC0(
      formData.value.dataInicio,
      formData.value.horaInicio
    );
    const dataFimUTC = convertToUTC0(
      formData.value.dataFim,
      formData.value.horaFim
    );
    const response = await fetch(`${PROXY_URL}/api/posicoes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        placa: formData.value.placa,
        dataInicio: dataInicioUTC,
        dataFim: dataFimUTC,
      }),
    });

    if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);

    const xmlText = await response.text();
    const posicoes = parseSoapResponse(xmlText);

    if (posicoes.length === 0) {
      error.value = "Nenhuma posição encontrada no período informado";
    } else {
      positions.value = posicoes;
      currentPage.value = 1;
      showMap.value = true;
      await nextTick();
      initMap();
    }
  } catch (err) {
    error.value = err.message || "Erro ao consultar API";
    console.error("Erro:", err);
  } finally {
    loading.value = false;
  }
};

const highlightPosition = (index) => {
  selectedPositionIndex.value = index;

  // Scroll suave para o mapa
  mapContainer.value?.scrollIntoView({ behavior: "smooth", block: "center" });

  if (!isHeatmapMode.value && markers[index]) {
    const pos = positions.value[index];

    // Centraliza o mapa na posição
    map.panTo({ lat: pos.latitude, lng: pos.longitude });
    map.setZoom(16);

    // Abre o InfoWindow
    google.maps.event.trigger(markers[index], "click");

    // Anima o marcador
    markers[index].setAnimation(google.maps.Animation.BOUNCE);
    setTimeout(() => {
      markers[index].setAnimation(null);
    }, 2000);
  }
};

const toggleFiliais = () => {
  showFiliais.value = !showFiliais.value;

  if (showFiliais.value) {
    addFiliaisToMap();
  } else {
    filiaisMarkers.forEach((marker) => marker.setMap(null));
  }
};

const addFiliaisToMap = () => {
  if (!map || filiais.value.length === 0) return;

  // Remove marcadores antigos
  filiaisMarkers.forEach((marker) => marker.setMap(null));
  filiaisMarkers = [];

  filiais.value.forEach((filial) => {
    const marker = new google.maps.Marker({
      position: {
        lat: parseFloat(filial.latitude),
        lng: parseFloat(filial.longitude),
      },
      map: map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#F59E0B", // Laranja
        fillOpacity: 1,
        strokeColor: "#FFFFFF",
        strokeWeight: 2,
      },
      title: filial.filial,
    });

    const infoWindow = new google.maps.InfoWindow({
      content: `
        <div style="padding: 8px;">
          <h3 style="margin: 0 0 4px 0; font-weight: bold; color: #F59E0B;">
            🏢 ${filial.filial}
          </h3>
          <p style="margin: 2px 0; font-size: 12px; color: #666;">Código: ${filial.codigo}</p>
        </div>
      `,
    });

    marker.addListener("click", () => {
      infoWindow.open(map, marker);
    });

    filiaisMarkers.push(marker);
  });
};

const goToPage = (page) => {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page;
    // Scroll suave para o topo da lista
    document
      .querySelector(".bg-white.rounded-2xl.shadow-xl.p-8:last-child")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
};

const nextPage = () => {
  if (currentPage.value < totalPages.value) {
    currentPage.value++;
  }
};

const prevPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--;
  }
};

const goToInputPage = () => {
  const page = parseInt(pageInput.value);
  if (page >= 1 && page <= totalPages.value) {
    goToPage(page);
    pageInput.value = page;
  } else {
    pageInput.value = currentPage.value;
  }
};
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
    <div class="max-w-7xl mx-auto">
      <!-- Formulário -->
      <div class="bg-white rounded-2xl shadow-xl p-8 mb-6">
        <div class="flex items-center gap-3 mb-6">
          <svg
            class="w-8 h-8 text-indigo-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <h1 class="text-3xl font-bold text-gray-800">
            Consulta de Posições - Link Monitoramento
          </h1>
        </div>

        <div class="space-y-6">
          <!-- Placa -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Placa do Veículo
            </label>
            <input
              type="text"
              v-model="formData.placa"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="ABC-1234"
            />
          </div>

          <!-- Período -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Data/Hora Início -->
            <div class="space-y-4">
              <h3
                class="text-lg font-semibold text-gray-700 flex items-center gap-2"
              >
                <svg
                  class="w-5 h-5 text-indigo-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                Data/Hora Início (Horário Brasil)
              </h3>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Data
                </label>
                <input
                  type="date"
                  v-model="formData.dataInicio"
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Hora
                </label>
                <input
                  type="time"
                  v-model="formData.horaInicio"
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <!-- Data/Hora Fim -->
            <div class="space-y-4">
              <h3
                class="text-lg font-semibold text-gray-700 flex items-center gap-2"
              >
                <svg
                  class="w-5 h-5 text-indigo-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Data/Hora Fim (Horário Brasil)
              </h3>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Data
                </label>
                <input
                  type="date"
                  v-model="formData.dataFim"
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Hora
                </label>
                <input
                  type="time"
                  v-model="formData.horaFim"
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          <!-- Botão -->
          <button
            @click="handleSubmit"
            :disabled="loading"
            class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              v-if="loading"
              class="w-5 h-5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              ></circle>
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <svg
              v-else
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            {{ loading ? "Consultando..." : "Consultar Posições" }}
          </button>
        </div>

        <!-- Erro -->
        <div
          v-if="error"
          class="mt-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3"
        >
          <svg
            class="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <h4 class="font-semibold text-red-800">Erro</h4>
            <p class="text-red-700 text-sm mt-1">{{ error }}</p>
          </div>
        </div>
      </div>

      <!-- Mapa do Google -->
      <div v-if="showMap" class="bg-white rounded-2xl shadow-xl p-8 mb-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <svg
              class="w-6 h-6 text-indigo-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
              />
            </svg>
            Trajeto do Veículo
          </h2>
          <div class="flex items-center gap-4">
            <button
              @click="toggleFiliais"
              class="px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2"
              :class="
                showFiliais
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
              "
            >
              <svg
                class="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
              {{ showFiliais ? "Ocultar Filiais" : "Mostrar Filiais" }}
            </button>
            <!-- Botão Toggle Mapa de Calor -->
            <button
              @click="toggleMapMode"
              class="px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2"
              :class="
                isHeatmapMode
                  ? 'bg-orange-500 hover:bg-orange-600 text-white'
                  : 'bg-indigo-500 hover:bg-indigo-600 text-white'
              "
            >
              <svg
                v-if="isHeatmapMode"
                class="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
              <svg
                v-else
                class="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z"
                />
              </svg>
              {{ isHeatmapMode ? "Mapa Normal" : "Mapa de Calor" }}
            </button>

            <!-- Legenda -->
            <div v-if="!isHeatmapMode" class="flex gap-3 text-sm">
              <span class="flex items-center gap-1">
                <span class="w-3 h-3 rounded-full bg-green-500"></span>
                Início
              </span>
              <span class="flex items-center gap-1">
                <span class="w-3 h-3 rounded-full bg-red-500"></span>
                Fim
              </span>
            </div>
            <div v-else class="text-sm text-gray-600 flex items-center gap-2">
              <span class="text-xs">🔵 Baixa → 🔴 Alta intensidade</span>
            </div>
          </div>
        </div>
        <div
          ref="mapContainer"
          class="w-full h-[600px] rounded-lg border border-gray-200"
        ></div>
      </div>

      <!-- Resultados -->
      <div
        v-if="positions.length > 0"
        class="bg-white rounded-2xl shadow-xl p-8"
      >
        <h2 class="text-2xl font-bold text-gray-800 mb-6">
          Posições Encontradas ({{ positions.length }})
        </h2>

        <div class="space-y-4">
          <div
            v-for="(pos, index) in paginatedPositions"
            :key="(currentPage - 1) * itemsPerPage + index"
            @click="highlightPosition((currentPage - 1) * itemsPerPage + index)"
            class="border rounded-lg p-4 transition-all cursor-pointer"
            :class="
              selectedPositionIndex === (currentPage - 1) * itemsPerPage + index
                ? 'border-indigo-500 bg-indigo-50 shadow-lg'
                : 'border-gray-200 hover:shadow-md hover:border-indigo-300'
            "
          >
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <p class="text-sm text-gray-500">Data/Hora (Brasil)</p>
                <p class="font-semibold text-gray-800">
                  {{ convertFromUTC0(pos.dataHora) }}
                </p>
              </div>
              <div>
                <p class="text-sm text-gray-500">Placa</p>
                <p class="font-semibold text-gray-800">{{ pos.placa }}</p>
              </div>
              <div>
                <p class="text-sm text-gray-500">Velocidade</p>
                <p class="font-semibold text-gray-800">
                  {{ pos.velocidade }} km/h
                </p>
              </div>
              <div>
                <p class="text-sm text-gray-500">Latitude</p>
                <p class="font-semibold text-gray-800">
                  {{ pos.latitude.toFixed(6) }}
                </p>
              </div>
              <div>
                <p class="text-sm text-gray-500">Longitude</p>
                <p class="font-semibold text-gray-800">
                  {{ pos.longitude.toFixed(6) }}
                </p>
              </div>
              <div>
                <p class="text-sm text-gray-500">Satélites</p>
                <p class="font-semibold text-gray-800">
                  {{ pos.numeroSatelites }}
                </p>
              </div>
              <div>
                <p class="text-sm text-gray-500">Ignição</p>
                <p
                  class="font-semibold"
                  :class="pos.ignicao ? 'text-green-600' : 'text-red-600'"
                >
                  {{ pos.ignicao ? "Ligada" : "Desligada" }}
                </p>
              </div>
              <div>
                <p class="text-sm text-gray-500">Odômetro</p>
                <p class="font-semibold text-gray-800">
                  {{ pos.odometro || "N/A" }}
                </p>
              </div>
              <div>
                <p class="text-sm text-gray-500">Número de Série</p>
                <p class="font-semibold text-gray-800">{{ pos.numeroSerie }}</p>
              </div>
            </div>
          </div>

          <!-- Paginação -->
          <div
            class="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 pt-4"
          >
            <div class="text-sm text-gray-600">
              Mostrando {{ (currentPage - 1) * itemsPerPage + 1 }} -
              {{ Math.min(currentPage * itemsPerPage, positions.length) }}
              de {{ positions.length }} posições
            </div>

            <div class="flex items-center gap-2">
              <!-- Botão Anterior -->
              <button
                @click="prevPage"
                :disabled="currentPage === 1"
                class="px-4 py-2 border rounded-lg font-medium transition-all"
                :class="
                  currentPage === 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'
                "
              >
                ← Anterior
              </button>

              <!-- Números de página -->
              <div class="flex gap-1 items-center">
                <!-- Primeira página -->
                <button
                  @click="goToPage(1)"
                  class="w-10 h-10 rounded-lg font-medium transition-all"
                  :class="
                    currentPage === 1
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  "
                >
                  1
                </button>

                <!-- Reticências esquerda -->
                <span v-if="currentPage > 3" class="px-2 text-gray-400"
                  >...</span
                >

                <!-- Páginas do meio -->
                <button
                  v-for="page in middlePages"
                  :key="page"
                  @click="goToPage(page)"
                  class="w-10 h-10 rounded-lg font-medium transition-all"
                  :class="
                    page === currentPage
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  "
                >
                  {{ page }}
                </button>

                <!-- Reticências direita -->
                <span
                  v-if="currentPage < totalPages - 2"
                  class="px-2 text-gray-400"
                  >...</span
                >

                <!-- Última página -->
                <button
                  v-if="totalPages > 1"
                  @click="goToPage(totalPages)"
                  class="w-10 h-10 rounded-lg font-medium transition-all"
                  :class="
                    currentPage === totalPages
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  "
                >
                  {{ totalPages }}
                </button>
              </div>

              <!-- Input ir para página -->
              <div class="flex items-center gap-2 ml-2">
                <span class="text-sm text-gray-600">Ir para:</span>
                <input
                  type="number"
                  v-model.number="pageInput"
                  @keyup.enter="goToInputPage"
                  min="1"
                  :max="totalPages"
                  class="w-16 px-2 py-1 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="1"
                />
                <button
                  @click="goToInputPage"
                  class="px-3 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all"
                >
                  Ir
                </button>
              </div>

              <!-- Botão Próximo -->
              <button
                @click="nextPage"
                :disabled="currentPage === totalPages"
                class="px-4 py-2 border rounded-lg font-medium transition-all"
                :class="
                  currentPage === totalPages
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'
                "
              >
                Próximo →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
