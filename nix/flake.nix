{
  description = "A flake for building import_map and deno_lockfile";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    rust.url = "github:oxalica/rust-overlay";
    utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, utils, nixpkgs, rust }:
    utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ rust.overlays.default ];
        };
        dir = builtins.getEnv "PWD";
        rust-toolchain = (pkgs.rust-bin.fromRustupToolchainFile "${dir}/rust-toolchain.toml").override {
          targets = [ "wasm32-unknown-unknown" ];
        };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [ deno ] ++ [ rust-toolchain ];
        };
      }
    );
}
