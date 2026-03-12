IDB_FRAMEWORKS = $(HOME)/.agent-device/idb-companion/Frameworks
XCODE_FRAMEWORKS = /Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/Library/Frameworks
OUTPUT = ax-scan

INSTALL_DIR = $(HOME)/.agent-device/bin

.PHONY: all clean install

all: $(OUTPUT)

install: $(OUTPUT)
	mkdir -p $(INSTALL_DIR)
	cp $(OUTPUT) $(INSTALL_DIR)/$(OUTPUT)

$(OUTPUT): ax-scan.m
	clang -fobjc-arc -fmodules \
		-F$(IDB_FRAMEWORKS) \
		-F$(XCODE_FRAMEWORKS) \
		-framework FBControlCore \
		-framework FBSimulatorControl \
		-framework Foundation \
		-rpath $(IDB_FRAMEWORKS) \
		-o $(OUTPUT) ax-scan.m

clean:
	rm -f $(OUTPUT)
