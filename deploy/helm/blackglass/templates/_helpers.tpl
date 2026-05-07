{{/*
Common helpers for the BLACKGLASS chart.
*/}}

{{- define "blackglass.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "blackglass.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "blackglass.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "blackglass.labels" -}}
helm.sh/chart: {{ include "blackglass.chart" . }}
{{ include "blackglass.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "blackglass.selectorLabels" -}}
app.kubernetes.io/name: {{ include "blackglass.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "blackglass.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{ default (include "blackglass.fullname" .) .Values.serviceAccount.name }}
{{- else -}}
{{ default "default" .Values.serviceAccount.name }}
{{- end -}}
{{- end -}}

{{/*
Resolve the secret name to use for envFrom. Returns:
  - .Values.secrets.existingSecret when set
  - <fullname>-env when chart-managed
*/}}
{{- define "blackglass.envSecretName" -}}
{{- if .Values.secrets.existingSecret -}}
{{ .Values.secrets.existingSecret }}
{{- else -}}
{{ include "blackglass.fullname" . }}-env
{{- end -}}
{{- end -}}

{{/*
Resolve the image reference for the web tier. Fails the install with a
clear message when image.web.tag is empty so we never accidentally
deploy "latest".
*/}}
{{- define "blackglass.webImage" -}}
{{- if not .Values.image.web.tag -}}
{{- fail "image.web.tag is required (do not deploy 'latest'). Pin to a release SHA." -}}
{{- end -}}
{{- printf "%s/%s:%s" .Values.image.registry .Values.image.web.repository .Values.image.web.tag -}}
{{- end -}}

{{- define "blackglass.workerImage" -}}
{{- if not .Values.image.worker.tag -}}
{{- fail "image.worker.tag is required (do not deploy 'latest'). Pin to a release SHA." -}}
{{- end -}}
{{- printf "%s/%s:%s" .Values.image.registry .Values.image.worker.repository .Values.image.worker.tag -}}
{{- end -}}
