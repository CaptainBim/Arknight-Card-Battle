# Fetches Arknights art (fan project, personal use) from the Aceship/Arknight-Images repo.
# Character E2 art -> resized PNG, class icons, arena backgrounds, Arts (skill) icons.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing

$root      = "D:\THEGAME\Arknight Card Battle"
$charDir   = Join-Path $root "assets\characters"
$uiDir     = Join-Path $root "assets\ui"
$arenaDir  = Join-Path $root "assets\arenas"
$artDir    = Join-Path $root "assets\arts"
$rawBase   = "https://raw.githubusercontent.com/Aceship/Arknight-Images/main"
$tmp       = Join-Path $env:TEMP "ak_assets"
New-Item -ItemType Directory -Force -Path $charDir,$uiDir,$arenaDir,$artDir,$tmp | Out-Null

# id => slug
$chars = [ordered]@{
  'char_112_siege'='siege'; 'char_222_bpipe'='bagpipe'; 'char_151_myrtle'='myrtle'; 'char_102_texas'='texas';
  'char_172_svrash'='silverash'; 'char_017_huang'='blaze'; 'char_010_chen'='chen'; 'char_350_surtr'='surtr';
  'char_136_hsguma'='hoshiguma'; 'char_202_demkni'='saria'; 'char_2014_nian'='nian'; 'char_311_mudrok'='mudrock';
  'char_103_angel'='exusiai'; 'char_340_shwaz'='schwarz'; 'char_391_rosmon'='rosmontis'; 'char_113_cqbw'='w';
  'char_180_amgoat'='eyjafjalla'; 'char_2013_cerber'='ceobe'; 'char_002_amiya'='amiya'; 'char_134_ifrit'='ifrit';
  'char_179_cgbird'='nightingale'; 'char_147_shining'='shining'; 'char_171_bldsk'='warfarin'; 'char_128_plosis'='ptilopsis';
  'char_291_aglina'='angelina'; 'char_358_lisa'='suzuran'; 'char_248_mgllan'='magallan'; 'char_206_gnosis'='gnosis';
  'char_215_mantic'='manticore'; 'char_400_weedy'='weedy'; 'char_144_red'='projektred'; 'char_355_ethan'='ethan';
  # ---- extended roster (batch 2) ----
  'char_220_grani'='grani'; 'char_401_elysm'='elysium'; 'char_261_sddrag'='reed'; 'char_497_ctable'='cantabile';
  'char_263_skadi'='skadi'; 'char_264_f12yin'='mountain'; 'char_293_thorns'='thorns'; 'char_140_whitew'='lappland';
  'char_423_blemsh'='blemishine'; 'char_416_zumama'='eunectes'; 'char_148_nearl'='nearl'; 'char_107_liskam'='liskarm';
  'char_367_swllow'='greythroat'; 'char_129_bluep'='bluepoison'; 'char_332_archet'='archetto'; 'char_204_platnm'='platinum';
  'char_213_mostma'='mostima'; 'char_377_gdglow'='goldenglow'; 'char_2015_dusk'='dusk'; 'char_426_billro'='carnelian';
  'char_003_kalts'='kaltsit'; 'char_436_whispr'='whisperain'; 'char_275_breeze'='breeze'; 'char_108_silent'='silence';
  'char_101_sora'='sora'; 'char_174_slbell'='pramanix'; 'char_254_vodfox'='shamare'; 'char_336_folivo'='scene';
  'char_237_gravel'='gravel'; 'char_173_slchan'='cliffheart'; 'char_225_haak'='aak'; 'char_250_phatom'='phantom';
  # ---- extended roster (batch 3) ----
  'char_362_saga'='saga'; 'char_4087_ines'='ines'; 'char_420_flamtl'='flametail'; 'char_476_blkngt'='blacknight';
  'char_4064_mlynar'='mlynar'; 'char_4009_irene'='irene'; 'char_2024_chyue'='chongyue'; 'char_1014_nearl2'='nearl2';
  'char_4039_horn'='horn'; 'char_474_glady'='gladiia'; 'char_430_fartth'='fartooth'; 'char_1013_chen2'='chen2';
  'char_219_meteo'='meteorite'; 'char_4133_logos'='logos'; 'char_1011_lava2'='lava2'; 'char_4042_lumen'='lumen';
  'char_402_tuye'='tuye'; 'char_2023_ling'='ling'; 'char_1012_skadi2'='skadi2'; 'char_1028_texas2'='texas2'
}

function Resize-Png {
  param([string]$Src,[string]$Dst,[int]$Max = 512)
  $img = [System.Drawing.Image]::FromFile($Src)
  try {
    $scale = [Math]::Min($Max / $img.Width, $Max / $img.Height)
    if ($scale -gt 1) { $scale = 1 }
    $w = [int][Math]::Round($img.Width * $scale)
    $h = [int][Math]::Round($img.Height * $scale)
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($img, 0, 0, $w, $h)
    $g.Dispose()
    $bmp.Save($Dst, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
  } finally { $img.Dispose() }
}

Write-Host "=== Characters ==="
$n = 0
foreach ($id in $chars.Keys) {
  $slug = $chars[$id]
  $dst  = Join-Path $charDir "$slug.png"
  if (Test-Path $dst) { Write-Host "skip $slug"; $n++; continue }
  $got = $false
  foreach ($v in @('_2','_1')) {
    $url = "$rawBase/characters/$id$v.png"
    $raw = Join-Path $tmp "$slug$v.png"
    try {
      Invoke-WebRequest -Uri $url -OutFile $raw -TimeoutSec 180
      Resize-Png -Src $raw -Dst $dst -Max 512
      Remove-Item $raw -Force
      Write-Host "ok   $slug  ($([math]::Round((Get-Item $dst).Length/1KB))KB)"
      $got = $true; $n++
      break
    } catch { }
  }
  if (-not $got) { Write-Warning "FAILED $slug ($id)" }
}

Write-Host "=== Class icons ==="
$classMap = @{
  'class_vanguard.png'='vanguard'; 'class_guard.png'='guard'; 'class_defender.png'='defender';
  'class_sniper.png'='sniper'; 'class_caster.png'='caster'; 'class_medic.png'='medic';
  'class_supporter.png'='supporter'; 'class_specialist.png'='specialist'
}
foreach ($f in $classMap.Keys) {
  $dst = Join-Path $uiDir ("class_" + $classMap[$f] + ".png")
  try { Invoke-WebRequest -Uri "$rawBase/classes/$f" -OutFile $dst -TimeoutSec 60; Write-Host "ok $f" }
  catch { Write-Warning "FAILED $f" }
}

Write-Host "=== Arena backgrounds ==="
$arenas = [ordered]@{
  '21_G6_decisivebattlealley_n.png'='alley_night'; '25_g03_yandowntown_n.png'='yan_downtown';
  '29_g6_mainstreet.png'='main_street'; '35_g11_yumendesert.png'='desert';
  '24_g1_snowyforest.png'='snow_forest'; '36_g3_redleafforest.png'='red_forest';
  '21_G3_victoria_street_d.png'='victoria_street'; '37_g10_wildbattlefield.png'='wild_field';
  # new arenas
  'bg_cher_0.png'='chernobog'; 'bg_lungmen_n.png'='lungmen_night'; 'bg_jungle_1.png'='sargon_jungle';
  'bg_ibcoastd.png'='iberia_coast'; 'bg_arena_1.png'='kazimierz_arena'; 'bg_snowconutry_2.png'='ursus_tundra'
}
foreach ($f in $arenas.Keys) {
  $dst = Join-Path $arenaDir ($arenas[$f] + ".png")
  if (Test-Path $dst) { Write-Host "skip $($arenas[$f])"; continue }
  try { Invoke-WebRequest -Uri "$rawBase/smallavg/backgrounds/$f" -OutFile $dst -TimeoutSec 90; Write-Host "ok $($arenas[$f])" }
  catch { Write-Warning "FAILED $f" }
}

Write-Host "=== Arts icons ==="
$arts = [ordered]@{
  'skill_icon_skchr_amgoat_3.png' ='arts_surge';       'skill_icon_skchr_cgbird_3.png' ='arts_frostnova';
  'skill_icon_skchr_ifrit_3.png'  ='arts_blazingsun';  'skill_icon_skchr_shining_3.png'='arts_medicdrone';
  'skill_icon_skchr_aglina_3.png' ='arts_reinforce';   'skill_icon_skchr_angel_3.png'  ='arts_barrage';
  'skill_icon_skchr_cqbw_3.png'   ='arts_airstrike';   'skill_icon_skchr_mostma_3.png' ='arts_chrono';
  'skill_icon_skchr_surtr_3.png'  ='arts_overload';    'skill_icon_skchr_shining_2.png'='arts_healbeacon';
  'skill_icon_skchr_myrtle_2.png' ='arts_dpdrone';     'skill_icon_skchr_chen_3.png'   ='arts_concussion';
  'skill_icon_skchr_chen_2.png'   ='arts_sweep';       'skill_icon_skchr_hsguma_3.png' ='arts_bulwark';
  'skill_icon_skchr_svrash_3.png' ='arts_counter';     'skill_icon_skchr_cqbw_2.png'   ='arts_reposition';
  'skill_icon_skchr_demkni_3.png' ='arts_missilestrike';'skill_icon_skchr_amgoat_2.png'='arts_gravemend';
  'skill_icon_skchr_svrash_2.png' ='arts_warcry';      'skill_icon_skchr_aglina_2.png' ='arts_quickdraw';
  'skill_icon_skchr_aglina_1.png' ='arts_dpburst';     'skill_icon_skchr_gnosis_3.png' ='arts_silencefield';
  'skill_icon_skchr_mudrok_3.png' ='arts_sweeper';     'skill_icon_skchr_cgbird_2.png' ='arts_laststand'
}
foreach ($f in $arts.Keys) {
  $dst = Join-Path $artDir ($arts[$f] + ".png")
  if (Test-Path $dst) { Write-Host "skip $($arts[$f])"; continue }
  try {
    $raw = Join-Path $tmp $f
    Invoke-WebRequest -Uri "$rawBase/skills/$f" -OutFile $raw -TimeoutSec 90
    Resize-Png -Src $raw -Dst $dst -Max 256
    Remove-Item $raw -Force
    Write-Host "ok $($arts[$f])"
  } catch { Write-Warning "FAILED $f" }
}

Write-Host "DONE. characters=$((Get-ChildItem $charDir -Filter *.png).Count) arenas=$((Get-ChildItem $arenaDir -Filter *.png).Count) arts=$((Get-ChildItem $artDir -Filter *.png).Count)"
